"""Conversão do CSV do OpenDataSUS em Parquet, um arquivo por ano.

Transformações aplicadas, mantendo os nomes originais das colunas:

- textos sem espaços nas pontas e vazio vira NULL;
- colunas ``DT_*`` viram TIMESTAMP;
- ``NU_ANO`` e ``NU_MES`` viram INTEGER;
- demais colunas continuam texto (ex.: resultados como "0,1" ou "AUSENTE").
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import duckdb

FORMATOS_DATA = [
    "%Y/%m/%d %H:%M:%S.%n",
    "%Y/%m/%d %H:%M:%S.%g",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d",
]
COLUNAS_INTEIRAS = {"NU_ANO", "NU_MES"}

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Resultado:
    linhas: int
    anos: list[int]


def literal(valor: str | Path) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def identificador(nome: str) -> str:
    return '"' + nome.replace('"', '""') + '"'


def arquivo_ano(pasta_tabela: Path, ano: int) -> Path:
    return pasta_tabela / f"ano={ano}" / "dados.parquet"


def expressao(coluna: str) -> str:
    valor = f"nullif(trim({identificador(coluna)}), '')"
    if coluna.startswith("DT_"):
        formatos = ", ".join(literal(f) for f in FORMATOS_DATA)
        valor = f"try_strptime({valor}, [{formatos}])"
    elif coluna in COLUNAS_INTEIRAS:
        valor = f"CAST({valor} AS INTEGER)"
    return f"{valor} AS {identificador(coluna)}"


def carregar_csv(con: duckdb.DuckDBPyConnection, csv: Path) -> list[str]:
    """Lê o CSV (já em UTF-8) como texto na tabela ``bruto`` e devolve as colunas."""
    con.execute(
        "CREATE OR REPLACE TABLE bruto AS SELECT * FROM read_csv("
        f"{literal(csv)}, delim = ';', quote = '\"', header = true, "
        "all_varchar = true)"
    )
    return [nome for (nome, *_) in con.execute("DESCRIBE bruto").fetchall()]


def avisar_datas_invalidas(
    con: duckdb.DuckDBPyConnection, rotulo: str, colunas: list[str]
) -> None:
    """try_strptime devolve NULL em silêncio; aqui contamos o que se perderia."""
    datas = [c for c in colunas if c.startswith("DT_")]
    if not datas:
        return
    formatos = ", ".join(literal(f) for f in FORMATOS_DATA)
    contagens = ", ".join(
        f"count(*) FILTER (WHERE nullif(trim({identificador(c)}), '') IS NOT NULL "
        f"AND try_strptime(trim({identificador(c)}), [{formatos}]) IS NULL)"
        for c in datas
    )
    ((*invalidas,),) = con.execute(f"SELECT {contagens} FROM bruto").fetchall()
    for coluna, n in zip(datas, invalidas, strict=True):
        if n:
            log.warning(
                "%s: %s tem %d datas em formato desconhecido", rotulo, coluna, n
            )


def gravar_parquet(con: duckdb.DuckDBPyConnection, selecao: str, destino: Path) -> None:
    # Escreve em um temporário e renomeia, para não deixar arquivo pela metade.
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".tmp")
    con.execute(
        f"COPY ({selecao}) TO {literal(temporario)} (FORMAT parquet, COMPRESSION zstd)"
    )
    temporario.rename(destino)


def converter(
    csv: Path,
    pasta_tabela: Path,
    rotulo: str,
    ano: int | None = None,
    coluna_ano: str | None = None,
) -> Resultado:
    """Converte ``csv`` em ``<pasta_tabela>/ano=AAAA/dados.parquet``.

    Com ``ano``, o CSV inteiro vai para aquele ano. Com ``coluna_ano``, o CSV é
    dividido pelos valores da coluna e anos que sumiram da fonte são removidos.
    """
    # Banco temporário em disco ao lado do CSV, para não estourar a memória.
    with duckdb.connect(csv.with_suffix(".duckdb")) as con:
        con.execute("SET preserve_insertion_order = false")
        colunas = carregar_csv(con, csv)
        avisar_datas_invalidas(con, rotulo, colunas)
        selecao = "SELECT " + ", ".join(expressao(c) for c in colunas) + " FROM bruto"
        ((linhas,),) = con.execute("SELECT count(*) FROM bruto").fetchall()

        if ano is not None:
            gravar_parquet(con, selecao, arquivo_ano(pasta_tabela, ano))
            return Resultado(linhas, [ano])

        coluna = identificador(coluna_ano)
        anos = [
            a
            for (a,) in con.execute(
                f"SELECT DISTINCT CAST(nullif(trim({coluna}), '') AS INTEGER) AS a "
                "FROM bruto ORDER BY a"
            ).fetchall()
        ]
        if None in anos:
            raise RuntimeError(f"{rotulo}: há linhas sem {coluna_ano}")
        for a in anos:
            gravar_parquet(
                con,
                f"{selecao} WHERE CAST(nullif(trim({coluna}), '') AS INTEGER) = {a}",
                arquivo_ano(pasta_tabela, a),
            )
        remover_anos_obsoletos(pasta_tabela, set(anos))
        return Resultado(linhas, anos)


def remover_anos_obsoletos(pasta_tabela: Path, anos: set[int]) -> None:
    for arquivo in pasta_tabela.glob("ano=*/dados.parquet"):
        if int(arquivo.parent.name.removeprefix("ano=")) not in anos:
            log.info("removendo %s: ano ausente na fonte", arquivo.parent)
            arquivo.unlink()
            arquivo.parent.rmdir()

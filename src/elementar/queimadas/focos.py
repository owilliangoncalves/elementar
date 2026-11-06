"""Coleta os focos de queimadas do INPE (satélite de referência) por município.

Fonte: o servidor de dados do Programa Queimadas, o mesmo do BDQueimadas
(``dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/``). Só entra o
satélite de referência (AQUA, passagem da tarde): é a série que o INPE usa para
comparar períodos, e somar todos os satélites conta o mesmo fogo várias vezes.

- Anos com arquivo anual (``anual/Brasil_sat_ref/focos_br_ref_AAAA.zip``): o
  arquivo só traz o nome do município, e o código vem da lista do IBGE,
  casando UF e nome (mais ``APELIDOS`` para grafias próprias do INPE).
- Anos sem anual, como o corrente: arquivos de ``mensal/Brasil/``, que têm o
  código IBGE e todos os satélites, filtrados para o de referência.

Grava ``<dados>/parquet/bruto/queimadas_focos/ano=AAAA/mes=MM/dados.parquet``.
O manifesto (``queimadas_focos/manifesto.json``) guarda o ETag de cada arquivo
remoto: reexecuções só baixam o que mudou, e quando o anual de um ano é
publicado ele substitui os mensais daquele ano. Parquet e manifesto são
gravados por renomeação, então uma execução interrompida refaz só o arquivo em
que parou.
"""

import argparse
import logging
import re
import shutil
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import duckdb
import httpx

from elementar.arquivos import manifesto
from elementar.arquivos.conversao import gravar_parquet, literal
from elementar.arquivos.download import baixar
from elementar.arquivos.fontes import primeiro_ano
from elementar.arquivos.trava import travar
from elementar.config import DADOS_PADRAO, configurar_log

BASE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv"
ANUAL = f"{BASE}/anual/Brasil_sat_ref"
MENSAL = f"{BASE}/mensal/Brasil"
IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"
CABECALHOS = {
    "User-Agent": "elementar (+https://github.com/owilliangoncalves/elementar)"
}
TABELA = "queimadas_focos"
SATELITE = "AQUA_M-T"

# Grafias do INPE que diferem do IBGE (nome no INPE, código IBGE).
APELIDOS = [
    ("AÇU", 2400208),  # Assú (RN)
    ("ARÊS", 2401206),  # Arez (RN)
    ("AUGUSTO SEVERO", 2401305),  # Campo Grande (RN)
    ("BARÃO DE MONTE ALTO", 3105509),  # Barão do Monte Alto (MG)
    ("DONA EUSÉBIA", 3122900),  # Dona Euzébia (MG)
    ("FORTALEZA DO TABOCÃO", 1708254),  # Tabocão (TO)
    ("GRACHO CARDOSO", 2802601),  # Graccho Cardoso (SE)
    ("SANTO ANTÔNIO DO LEVERGER", 5107800),  # Santo Antônio de Leverger (MT)
    ("SÃO LUIZ", 1400605),  # São Luiz do Anauá (RR)
    ("SÃO THOMÉ DAS LETRAS", 3165206),  # São Tomé das Letras (MG)
]

# Mesmas colunas, na mesma ordem, para as duas origens.
SELECAO_ANUAL = """
SELECT trim(f.foco_id) AS foco_id,
       CAST(trim(f.data_pas) AS TIMESTAMP) AS data_hora,
       CAST(trim(f.lat) AS DOUBLE) AS lat,
       CAST(trim(f.lon) AS DOUBLE) AS lon,
       coalesce(a.codigo, m.codigo) AS codigo_ibge,
       trim(f.municipio) AS municipio,
       trim(f.estado) AS estado,
       trim(f.bioma) AS bioma
FROM csv AS f
LEFT JOIN ufs AS u ON u.nome = norma(f.estado)
LEFT JOIN municipios AS m ON m.uf = u.codigo AND m.nome = norma(f.municipio)
LEFT JOIN apelidos AS a ON a.uf = u.codigo AND a.nome = norma(f.municipio)
"""
SELECAO_MENSAL = f"""
SELECT trim(id) AS foco_id,
       CAST(trim(data_hora_gmt) AS TIMESTAMP) AS data_hora,
       CAST(trim(lat) AS DOUBLE) AS lat,
       CAST(trim(lon) AS DOUBLE) AS lon,
       CAST(nullif(trim(municipio_id), '') AS INTEGER) AS codigo_ibge,
       trim(municipio) AS municipio,
       trim(estado) AS estado,
       trim(bioma) AS bioma
FROM csv
WHERE trim(satelite) = '{SATELITE}'
"""

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Fonte:
    """Um arquivo remoto: o anual de ``ano`` ou o mensal de ``ano``/``mes``."""

    ano: int
    mes: int | None
    url: str

    @property
    def rotulo(self) -> str:
        return f"{TABELA} {self.ano}" + (f"-{self.mes:02d}" if self.mes else "")


def arquivo_mes(pasta_tabela: Path, ano: int, mes: int) -> Path:
    return pasta_tabela / f"ano={ano}" / f"mes={mes:02d}" / "dados.parquet"


def listar(cliente: httpx.Client, pasta: str, padrao: str) -> dict[str, str]:
    """Arquivos da listagem do servidor que casam com ``padrao`` (grupo 1 = chave)."""
    resposta = cliente.get(f"{pasta}/")
    resposta.raise_for_status()
    nomes = sorted(set(re.findall(r'href="([^"/?]+)"', resposta.text)))
    # .csv depois de .zip na ordem, então o CSV vence quando há os dois.
    return {m[1]: nome for nome in nomes if (m := re.fullmatch(padrao, nome))}


def fontes(cliente: httpx.Client, inicio: int, fim: int) -> list[Fonte]:
    anuais = listar(cliente, ANUAL, r"focos_br_ref_(\d{4})\.zip")
    mensais = listar(cliente, MENSAL, r"focos_mensal_br_(\d{6})\.(?:csv|zip)")
    lista = []
    for ano in range(inicio, fim + 1):
        if str(ano) in anuais:
            lista.append(Fonte(ano, None, f"{ANUAL}/{anuais[str(ano)]}"))
            continue
        do_ano = [
            Fonte(ano, int(chave[4:]), f"{MENSAL}/{nome}")
            for chave, nome in sorted(mensais.items())
            if chave.startswith(str(ano))
        ]
        if not do_ano:
            log.warning("%s %d: nenhum arquivo anual nem mensal publicado", TABELA, ano)
        lista += do_ano
    return lista


def municipios_ibge(cliente: httpx.Client, destino: Path) -> Path:
    """Lista de municípios do IBGE, baixada uma vez e guardada em ``destino``."""
    if not destino.exists():
        log.info("%s: baixando a lista de municípios do IBGE", TABELA)
        resposta = cliente.get(IBGE)
        resposta.raise_for_status()
        temporario = destino.with_name(destino.name + ".tmp")
        temporario.write_bytes(resposta.content)
        temporario.rename(destino)
    return destino


def extrair(arquivo: Path, trabalho: Path) -> Path:
    """O CSV baixado, extraído do zip quando for o caso (já vem em UTF-8)."""
    if arquivo.suffix != ".zip":
        return arquivo
    with zipfile.ZipFile(arquivo) as zip_:
        csvs = [n for n in zip_.namelist() if n.lower().endswith(".csv")]
        if len(csvs) != 1:
            raise RuntimeError(f"{arquivo.name}: esperava 1 CSV, encontrei {csvs}")
        csv = trabalho / Path(csvs[0]).name
        with zip_.open(csvs[0]) as origem, csv.open("wb") as saida:
            shutil.copyfileobj(origem, saida)
    arquivo.unlink()  # libera espaço antes da conversão
    return csv


def preparar_nomes(con: duckdb.DuckDBPyConnection, ibge: Path) -> None:
    """Tabelas para achar o código IBGE pela UF e pelo nome normalizado."""
    con.execute(
        "CREATE MACRO norma(s) AS "
        "regexp_replace(upper(strip_accents(trim(s))), '[^A-Z0-9]', '', 'g')"
    )
    json_ = f"read_json({literal(ibge)})"
    con.execute(
        'CREATE TABLE municipios AS SELECT CAST("UF-id" AS INTEGER) AS uf, '
        'norma("municipio-nome") AS nome, '
        f'CAST("municipio-id" AS INTEGER) AS codigo FROM {json_}'
    )
    con.execute(
        'CREATE TABLE ufs AS SELECT DISTINCT CAST("UF-id" AS INTEGER) AS codigo, '
        f'norma("UF-nome") AS nome FROM {json_}'
    )
    con.execute("CREATE TABLE apelidos (nome VARCHAR, codigo INTEGER)")
    con.executemany("INSERT INTO apelidos VALUES (norma(?), ?)", APELIDOS)
    con.execute("ALTER TABLE apelidos ADD COLUMN uf INTEGER")
    con.execute("UPDATE apelidos SET uf = codigo // 100000")


def avisar_sem_municipio(con: duckdb.DuckDBPyConnection, rotulo: str) -> int:
    """Focos sem código IBGE ficam gravados; aqui avisamos quantos e quais."""
    faltas = con.execute(
        "SELECT estado, municipio, count(*) AS n FROM focos "
        "WHERE codigo_ibge IS NULL GROUP BY ALL ORDER BY n DESC"
    ).fetchall()
    total = sum(n for *_, n in faltas)
    if total:
        exemplos = ", ".join(f"{m} ({e}): {n}" for e, m, n in faltas[:10])
        log.warning(
            "%s: %d focos sem código IBGE em %d municípios; %s",
            rotulo,
            total,
            len(faltas),
            exemplos,
        )
    return total


def converter(fonte: Fonte, csv: Path, pasta_tabela: Path, ibge: Path) -> dict:
    """Grava os focos do CSV por mês e devolve os dados para o manifesto."""
    with duckdb.connect() as con:
        con.execute("SET preserve_insertion_order = false")
        con.execute(
            "CREATE VIEW csv AS SELECT * FROM read_csv("
            f"{literal(csv)}, header = true, all_varchar = true)"
        )
        if fonte.mes is None:
            preparar_nomes(con, ibge)
            con.execute(f"CREATE TABLE focos AS {SELECAO_ANUAL}")
        else:
            con.execute(f"CREATE TABLE focos AS {SELECAO_MENSAL}")

        periodos = con.execute(
            "SELECT DISTINCT year(data_hora), month(data_hora) FROM focos ORDER BY 2"
        ).fetchall()
        if any(a != fonte.ano or fonte.mes not in (None, m) for a, m in periodos):
            raise RuntimeError(f"{fonte.rotulo}: focos fora do período do arquivo")
        ((linhas,),) = con.execute("SELECT count(*) FROM focos").fetchall()
        if fonte.mes is None:
            meses = [m for _, m in periodos]
        else:
            meses = [fonte.mes]  # grava o mês mesmo sem focos do satélite
            if not linhas:
                log.warning("%s: nenhum foco do %s", fonte.rotulo, SATELITE)

        sem_municipio = avisar_sem_municipio(con, fonte.rotulo)
        for mes in meses:
            gravar_parquet(
                con,
                f"SELECT * FROM focos WHERE month(data_hora) = {mes} "
                "ORDER BY data_hora, foco_id",
                arquivo_mes(pasta_tabela, fonte.ano, mes),
            )
    return {"linhas": linhas, "meses": meses, "sem_municipio": sem_municipio}


def remover_meses(pasta_tabela: Path, ano: int, manter: set[int]) -> None:
    """Apaga meses do ano que o arquivo anual não trouxe (sobras dos mensais)."""
    for arquivo in (pasta_tabela / f"ano={ano}").glob("mes=*/dados.parquet"):
        if int(arquivo.parent.name.removeprefix("mes=")) not in manter:
            log.info("removendo %s: ausente no arquivo anual", arquivo.parent)
            arquivo.unlink()
            arquivo.parent.rmdir()


def atualizado(registro: dict | None, pasta_tabela: Path, fonte: Fonte) -> bool:
    """O manifesto só vale se os Parquet que ele cita ainda existem."""
    return bool(registro) and all(
        arquivo_mes(pasta_tabela, fonte.ano, m).exists() for m in registro["meses"]
    )


def processar(
    fonte: Fonte,
    cliente: httpx.Client,
    registros: dict[str, dict],
    pasta_tabela: Path,
    temporaria: Path,
    forcar: bool,
) -> None:
    registro = registros.get(fonte.url)
    etag = (
        registro["etag"]
        if not forcar and atualizado(registro, pasta_tabela, fonte)
        else None
    )
    temporaria.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=temporaria) as trabalho:
        trabalho = Path(trabalho)
        baixado = trabalho / fonte.url.rsplit("/", 1)[-1]
        versao = baixar(cliente, fonte.url, baixado, etag)
        if versao is None:
            return
        log.info("%s: convertendo %s", fonte.rotulo, baixado.name)
        ibge = pasta_tabela / "municipios_ibge.json"
        if fonte.mes is None:
            municipios_ibge(cliente, ibge)
        resultado = converter(fonte, extrair(baixado, trabalho), pasta_tabela, ibge)

    if fonte.mes is None:
        remover_meses(pasta_tabela, fonte.ano, set(resultado["meses"]))
        # O anual substitui os mensais do ano, que não serão mais consultados.
        for url, outro in list(registros.items()):
            if outro.get("ano") == fonte.ano and outro.get("mes") is not None:
                del registros[url]

    registros[fonte.url] = {
        "ano": fonte.ano,
        "mes": fonte.mes,
        "etag": versao.etag,
        "last_modified": versao.last_modified,
        **resultado,
        "atualizado_em": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    log.info("%s: %d focos gravados", fonte.rotulo, resultado["linhas"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--inicio",
        type=int,
        default=primeiro_ano(),
        help="AAAA (padrão: primeiro ano da vigilância da água)",
    )
    parser.add_argument(
        "--fim", type=int, default=date.today().year, help="AAAA (padrão: ano corrente)"
    )
    parser.add_argument(
        "--forcar", action="store_true", help="ignora o manifesto e baixa tudo"
    )
    args = parser.parse_args()
    configurar_log()

    pasta_tabela = args.dados / "parquet" / "bruto" / TABELA
    caminho_manifesto = pasta_tabela / "manifesto.json"

    with (
        httpx.Client(
            headers=CABECALHOS,
            timeout=httpx.Timeout(60, read=300),
            follow_redirects=True,
        ) as cliente,
        travar(pasta_tabela),
    ):
        if args.forcar:
            (pasta_tabela / "municipios_ibge.json").unlink(missing_ok=True)
        registros = manifesto.ler(caminho_manifesto)
        falhas = []
        for fonte in fontes(cliente, args.inicio, args.fim):
            try:
                processar(
                    fonte,
                    cliente,
                    registros,
                    pasta_tabela,
                    args.dados / "tmp",
                    args.forcar,
                )
            except Exception:
                log.exception("%s: falha", fonte.rotulo)
                falhas.append(fonte.rotulo)
            else:
                # Grava a cada arquivo, para não perder o progresso.
                manifesto.gravar(caminho_manifesto, registros)

    if falhas:
        sys.exit(f"Atualização incompleta: {', '.join(falhas)}")


if __name__ == "__main__":
    main()

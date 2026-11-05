"""Acesso aos dados da API: DuckDB em memória sobre a camada servida.

Na inicialização, as contagens por município, ano e parâmetro são calculadas
uma vez e mantidas em tabelas pequenas, e o controle mensal (menos de 1 milhão
de linhas) é carregado inteiro. As linhas da vigilância (dezenas de milhões)
continuam no Parquet e são lidas sob demanda, filtradas por ano.

Só contagens, sem tratamento dos valores: ``resultado`` ainda não é
interpretado. Dados novos do pipeline valem a partir do próximo reinício.
"""

import logging
from pathlib import Path
from typing import Any

import duckdb

from elementar.arquivos import manifesto

VIGILANCIA = "agua_vigilancia_parametros_basicos"
CONTROLE = "agua_controle_mensal_amostras_fora_padrao"

log = logging.getLogger(__name__)


def _linhas(cursor: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    colunas = [d[0] for d in cursor.description]
    return [dict(zip(colunas, linha, strict=True)) for linha in cursor.fetchall()]


class Base:
    def __init__(self, dados: Path) -> None:
        servido = dados / "parquet" / "servido"
        self.caminho_manifesto = dados / "parquet" / "bruto" / "manifesto.json"
        self.con = duckdb.connect()
        for nome in (VIGILANCIA, CONTROLE):
            padrao = str(servido / nome / "*" / "dados.parquet").replace("'", "''")
            self.con.execute(
                f"CREATE VIEW {nome} AS SELECT * FROM "
                f"read_parquet('{padrao}', hive_partitioning = true)"
            )
        log.info("calculando agregados a partir de %s", servido)
        self._materializar()

    def _materializar(self) -> None:
        self.con.execute(
            f"""
            CREATE TABLE controle AS SELECT * FROM {CONTROLE};

            CREATE TABLE municipios AS
            SELECT codigo_ibge, arg_max(municipio, ano) AS municipio,
                   arg_max(uf, ano) AS uf, arg_max(regiao_geografica, ano) AS regiao
            FROM (
                SELECT codigo_ibge, municipio, uf, regiao_geografica, ano
                FROM {VIGILANCIA}
                UNION ALL
                SELECT codigo_ibge, municipio, uf, regiao_geografica, ano FROM controle
            )
            GROUP BY codigo_ibge;

            ALTER TABLE municipios ADD COLUMN busca VARCHAR;
            UPDATE municipios SET busca = lower(strip_accents(municipio));

            CREATE TABLE vigilancia_contagens AS
            SELECT codigo_ibge, ano, parametro, count(*) AS analises,
                   max(data_da_coleta)::DATE AS ultima_coleta
            FROM {VIGILANCIA} GROUP BY ALL;

            CREATE TABLE controle_contagens AS
            SELECT codigo_ibge, ano, parametro, count(*) AS registros
            FROM controle GROUP BY ALL;
            """
        )
        ((total,),) = self.con.execute("SELECT count(*) FROM municipios").fetchall()
        log.info("agregados prontos: %d municípios", total)

    def _cursor(self) -> duckdb.DuckDBPyConnection:
        # Um cursor por chamada: a conexão é compartilhada entre threads.
        return self.con.cursor()

    def atualizacao(self) -> dict[str, dict]:
        fontes: dict[str, dict] = {}
        for url, registro in manifesto.ler(self.caminho_manifesto).items():
            fonte = fontes.setdefault(
                registro["tabela"], {"arquivos": [], "baixado_em": None}
            )
            fonte["arquivos"].append(
                {"url": url, "modificado_na_fonte": registro["last_modified"]}
            )
            fonte["baixado_em"] = max(
                filter(None, [fonte["baixado_em"], registro["atualizado_em"]])
            )
        return fontes

    def estados(self) -> list[dict[str, Any]]:
        cursor = self._cursor()
        cursor.execute(
            "SELECT uf, any_value(regiao) AS regiao, count(*) AS municipios "
            "FROM municipios GROUP BY uf ORDER BY uf"
        )
        return _linhas(cursor)

    def buscar(self, texto: str | None, uf: str | None, limite: int) -> list[dict]:
        filtros, parametros = ["true"], {"texto": texto or "", "limite": limite}
        if texto:
            filtros.append("contains(busca, lower(strip_accents($texto)))")
        if uf:
            filtros.append("uf = upper($uf)")
            parametros["uf"] = uf
        cursor = self._cursor()
        cursor.execute(
            "SELECT codigo_ibge, municipio, uf FROM municipios "
            f"WHERE {' AND '.join(filtros)} "
            # Quem começa com o texto aparece antes de quem só o contém.
            "ORDER BY NOT starts_with(busca, lower(strip_accents($texto))), "
            "municipio, uf LIMIT $limite",
            parametros,
        )
        return _linhas(cursor)

    def municipio(self, codigo: str) -> dict[str, Any] | None:
        cursor = self._cursor()
        cursor.execute(
            "SELECT codigo_ibge, municipio, uf, regiao FROM municipios "
            "WHERE codigo_ibge = ?",
            [codigo],
        )
        encontrados = _linhas(cursor)
        if not encontrados:
            return None
        resultado = encontrados[0]

        cursor.execute(
            "SELECT ano, parametro, analises, ultima_coleta FROM vigilancia_contagens "
            "WHERE codigo_ibge = ? ORDER BY ano DESC, parametro",
            [codigo],
        )
        vigilancia = _linhas(cursor)
        resultado["vigilancia"] = (
            {
                "ultima_coleta": max(
                    (v["ultima_coleta"] for v in vigilancia if v["ultima_coleta"]),
                    default=None,
                ),
                "por_ano": _por_ano(vigilancia, "analises"),
            }
            if vigilancia
            else None
        )

        cursor.execute(
            "SELECT ano, parametro, registros FROM controle_contagens "
            "WHERE codigo_ibge = ? ORDER BY ano DESC, parametro",
            [codigo],
        )
        controle = _linhas(cursor)
        resultado["controle_fora_do_padrao"] = (
            {"por_ano": _por_ano(controle, "registros")} if controle else None
        )
        return resultado

    def municipios_da_uf(self, uf: str) -> list[dict[str, Any]]:
        cursor = self._cursor()
        cursor.execute(
            """
            SELECT m.codigo_ibge, m.municipio,
                   (SELECT sum(analises) FROM vigilancia_contagens v
                    WHERE v.codigo_ibge = m.codigo_ibge) AS vigilancia_analises,
                   (SELECT sum(registros) FROM controle_contagens c
                    WHERE c.codigo_ibge = m.codigo_ibge)
                       AS controle_fora_do_padrao_registros
            FROM municipios m WHERE m.uf = upper(?) ORDER BY m.municipio
            """,
            [uf],
        )
        return _linhas(cursor)

    def linhas(
        self,
        tabela: str,
        codigo: str,
        ano: int | None,
        parametro: str | None,
        limite: int,
        deslocamento: int,
    ) -> list[dict[str, Any]]:
        """Registros de um município, paginados. Filtrar por ano poupa leitura."""
        origem = {"vigilancia": VIGILANCIA, "controle": "controle"}[tabela]
        filtros = ["codigo_ibge = $codigo"]
        parametros: dict[str, Any] = {
            "codigo": codigo,
            "limite": limite,
            "deslocamento": deslocamento,
        }
        if ano is not None:
            filtros.append("ano = $ano")
            parametros["ano"] = ano
        if parametro:
            filtros.append("parametro = $parametro")
            parametros["parametro"] = parametro
        cursor = self._cursor()
        cursor.execute(
            f"SELECT * EXCLUDE (codigo_ibge) FROM {origem} "
            f"WHERE {' AND '.join(filtros)} "
            "ORDER BY ano DESC LIMIT $limite OFFSET $deslocamento",
            parametros,
        )
        return _linhas(cursor)


def _por_ano(linhas: list[dict[str, Any]], chave: str) -> list[dict[str, Any]]:
    """Agrupa linhas (ano, parametro, contagem) em um item por ano."""
    anos: dict[int, dict[str, Any]] = {}
    for linha in linhas:
        item = anos.setdefault(
            linha["ano"], {"ano": linha["ano"], chave: 0, "por_parametro": {}}
        )
        item[chave] += linha[chave]
        item["por_parametro"][linha["parametro"]] = linha[chave]
    return list(anos.values())

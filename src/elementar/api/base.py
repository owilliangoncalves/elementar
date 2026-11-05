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
FAIXAS = 24  # barras do histograma de cada parâmetro numérico
# Motivo nulo vira um valor próprio, para poder ser escolhido no filtro.
MOTIVO = "coalesce(motivo_da_coleta, 'Não informado')"
AREAS = 5  # áreas listadas por parâmetro no controle; o resto vira "outras"

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

    def municipios_com_totais(self, uf: str | None = None) -> list[dict[str, Any]]:
        """Todos os municípios (ou só os da UF) com o total de cada fonte."""
        cursor = self._cursor()
        cursor.execute(
            """
            SELECT m.codigo_ibge, m.municipio, m.uf, m.regiao,
                   v.analises AS vigilancia_analises,
                   c.registros AS controle_fora_do_padrao_registros
            FROM municipios m
            LEFT JOIN (SELECT codigo_ibge, sum(analises) AS analises
                       FROM vigilancia_contagens GROUP BY ALL) v USING (codigo_ibge)
            LEFT JOIN (SELECT codigo_ibge, sum(registros) AS registros
                       FROM controle_contagens GROUP BY ALL) c USING (codigo_ibge)
            WHERE $uf IS NULL OR m.uf = upper($uf)
            ORDER BY m.municipio, m.uf
            """,
            {"uf": uf},
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

    def resumo_vigilancia(
        self, codigo: str, ano: int, motivo: str | None = None
    ) -> list[dict[str, Any]]:
        """Análises do ano partidas por parâmetro: por mês, por motivo e o
        que o resultado permite contar sem interpretá-lo (presença ou a
        distribuição dos valores numéricos).

        Com ``motivo``, só as coletas daquele motivo entram nas contagens;
        ``motivos`` continua com todos, para o front montar o filtro."""
        filtro = f"FROM {VIGILANCIA} WHERE codigo_ibge = $codigo AND ano = $ano"
        valores = (
            "SELECT parametro, "
            f"try_cast(replace(resultado, ',', '.') AS DOUBLE) AS x {filtro} "
            f"AND ($motivo IS NULL OR {MOTIVO} = $motivo)"
        )
        cursor = self._cursor()

        cursor.execute(
            "SELECT parametro, month(data_da_coleta) AS mes, "
            f"{MOTIVO} AS motivo, count(*) AS analises, "
            "count(*) FILTER (WHERE resultado = 'PRESENTE') AS presentes, "
            "count(*) FILTER (WHERE resultado = 'AUSENTE') AS ausentes, "
            "count(*) FILTER (WHERE resultado IN ('MENOR_LQ', 'MENOR_LD')) "
            f"AS abaixo_do_limite {filtro} GROUP BY ALL",
            {"codigo": codigo, "ano": ano},
        )
        parametros: dict[str, dict[str, Any]] = {}
        for linha in _linhas(cursor):
            item = parametros.setdefault(
                linha["parametro"],
                {
                    "parametro": linha["parametro"],
                    "analises": 0,
                    "por_mes": [0] * 12,
                    "presentes_por_mes": [0] * 12,
                    "motivos": {},
                    "abaixo_do_limite": 0,
                    "presenca": None,
                    "numerico": None,
                },
            )
            item["motivos"][linha["motivo"]] = (
                item["motivos"].get(linha["motivo"], 0) + linha["analises"]
            )
            if motivo is not None and linha["motivo"] != motivo:
                continue
            item["analises"] += linha["analises"]
            if linha["mes"]:
                item["por_mes"][linha["mes"] - 1] += linha["analises"]
                item["presentes_por_mes"][linha["mes"] - 1] += linha["presentes"]
            if linha["presentes"] or linha["ausentes"]:
                presenca = item["presenca"] or {"presente": 0, "ausente": 0}
                presenca["presente"] += linha["presentes"]
                presenca["ausente"] += linha["ausentes"]
                item["presenca"] = presenca
            item["abaixo_do_limite"] += linha["abaixo_do_limite"]

        # Histograma entre o menor valor e o percentil 99: valores extremos
        # (há turbidez de 73.500) achatariam o resto e vão contados à parte.
        limites = (
            f"WITH v AS ({valores}), lim AS ("
            "SELECT parametro, min(x) AS de, quantile_cont(x, 0.99) AS ate "
            "FROM v WHERE x IS NOT NULL GROUP BY 1)"
        )
        cursor.execute(
            f"{limites} SELECT parametro, any_value(de) AS de, any_value(ate) AS ate, "
            "count(*) AS valores, max(x) AS maximo, "
            "quantile_cont(x, [0.25, 0.5, 0.75]) AS quartis, "
            "count(*) FILTER (WHERE x > ate) AS acima "
            "FROM v JOIN lim USING (parametro) WHERE x IS NOT NULL GROUP BY 1",
            {"codigo": codigo, "ano": ano, "motivo": motivo},
        )
        for linha in _linhas(cursor):
            q1, mediana, q3 = linha.pop("quartis")
            parametros[linha.pop("parametro")]["numerico"] = {
                **linha,
                "q1": q1,
                "mediana": mediana,
                "q3": q3,
                "histograma": [0] * FAIXAS,
            }

        cursor.execute(
            f"{limites} SELECT parametro, CASE WHEN ate > de THEN "
            f"least({FAIXAS - 1}, floor((x - de) / (ate - de) * {FAIXAS})) "
            "ELSE 0 END::INTEGER AS faixa, count(*) AS n "
            "FROM v JOIN lim USING (parametro) WHERE x <= ate GROUP BY ALL",
            {"codigo": codigo, "ano": ano, "motivo": motivo},
        )
        for parametro, faixa, n in cursor.fetchall():
            parametros[parametro]["numerico"]["histograma"][faixa] = n

        # Com motivo, um parâmetro pode vir com zero análises: fica na resposta
        # para que ``motivos`` traga todas as opções do filtro.
        return sorted(parametros.values(), key=lambda p: -p["analises"])

    def resumo_controle(self, codigo: str, ano: int) -> list[dict[str, Any]]:
        """Registros fora do padrão do ano partidos por parâmetro, com zona,
        ponto de monitoramento e as áreas que mais aparecem."""
        cursor = self._cursor()
        cursor.execute(
            "SELECT parametro, zona, ponto_de_monitoramento AS ponto, area, "
            "count(*) AS n FROM controle "
            "WHERE codigo_ibge = $codigo AND ano = $ano GROUP BY ALL",
            {"codigo": codigo, "ano": ano},
        )
        parametros: dict[str, dict[str, Any]] = {}
        for linha in _linhas(cursor):
            item = parametros.setdefault(
                linha["parametro"],
                {
                    "parametro": linha["parametro"],
                    "registros": 0,
                    "zonas": {},
                    "pontos": {},
                    "areas": {},
                },
            )
            n = linha["n"]
            item["registros"] += n
            for chave, valor in (
                ("zonas", linha["zona"]),
                ("pontos", linha["ponto"]),
                ("areas", linha["area"]),
            ):
                valor = valor or "Não informado"
                item[chave][valor] = item[chave].get(valor, 0) + n

        for item in parametros.values():
            areas = sorted(item["areas"].items(), key=lambda a: -a[1])
            item["areas"] = [{"area": a, "registros": n} for a, n in areas[:AREAS]]
            item["outras_areas"] = sum(n for _, n in areas[AREAS:])
        return sorted(parametros.values(), key=lambda p: -p["registros"])


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

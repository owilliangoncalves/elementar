"""Acesso aos dados da API: DuckDB em memória sobre a camada servida.

Na inicialização, as contagens por município, ano e parâmetro são calculadas
uma vez e mantidas em tabelas pequenas, e o controle mensal (menos de 1 milhão
de linhas) é carregado inteiro. As linhas da vigilância (dezenas de milhões)
continuam no Parquet e são lidas sob demanda, filtradas por ano.

Só contagens, sem tratamento dos valores: ``resultado`` ainda não é
interpretado. Dados novos do pipeline valem a partir do próximo reinício.

A qualidade do ar (``elementar-sisam``) vem da camada bruta: na inicialização
viram médias mensais e os extremos diários por município e poluente. Os focos
de queimadas (``elementar-queimadas``) também: viram contagens por dia, mês e
bioma. Os alertas de desmatamento (``elementar-desmatamento``) ficam inteiros
numa tabela pequena (uma linha por alerta) e são somados a cada consulta.
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
AR = "ar_sisam"
POLUENTES = ("pm25", "pm10", "o3", "no2", "so2", "co")
QUEIMADAS = "queimadas_focos"
DESMATAMENTO = "desmatamento_alertas"
# Faixas de tamanho do alerta inteiro (ha), as mesmas da plataforma MapBiomas.
FAIXAS_AREA = (1, 5, 10, 25, 50, 100)
# Cruzamentos de cada alerta, na ordem em que a API devolve.
CRUZAMENTOS = {
    "car": "car_count > 0",
    "reserva_legal": "legal_reserve_count > 0",
    "app": "ppa_count > 0",
    "nascente": "river_source_count > 0",
    "embargo": "embargoed_properties_count > 0",
    "autorizacao": "def_asv > 0 OR def_uas > 0 OR def_pmfs > 0 OR def_poa > 0 "
    "OR def_efp > 0",
    "terra_indigena": "indigenous_land_area > 0",
    "unidade_conservacao": "conservation_unit_area > 0",
    "assentamento": "settlement_area > 0",
    "quilombo": "quilombo_area > 0",
}
# SISAM e INPE têm só Brasília; o SISAGUA divide o DF em Regiões Administrativas.
BRASILIA = "530010"

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
        self._materializar_ar(dados / "parquet" / "bruto" / AR)
        self._materializar_queimadas(dados / "parquet" / "bruto" / QUEIMADAS)
        self._materializar_desmatamento(dados / "parquet" / "bruto" / DESMATAMENTO)

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

    def _materializar_ar(self, pasta: Path) -> None:
        """Médias mensais e extremos diários. O código do SISAM tem 7 dígitos
        (com o verificador) e vira o de 6, usado pelo SISAGUA e pela API."""
        arquivos = str(pasta / "*" / "*" / "dados.parquet").replace("'", "''")
        if not any(pasta.glob("*/*/dados.parquet")):
            log.warning("%s: sem dados de qualidade do ar em %s", AR, pasta)
            self.con.execute(
                "CREATE TABLE ar_mensal (codigo_ibge VARCHAR, poluente VARCHAR, "
                "unidade VARCHAR, mes VARCHAR, media DOUBLE, minimo DOUBLE, "
                "maximo DOUBLE, dias INTEGER, origem VARCHAR);"
                "CREATE TABLE ar_extremos (codigo_ibge VARCHAR, poluente VARCHAR, "
                "maximo DOUBLE, data_maximo DATE, dias_maximo INTEGER, "
                "minimo DOUBLE, data_minimo DATE, dias_minimo INTEGER)"
            )
            return
        self.con.execute(
            f"""
            CREATE VIEW {AR} AS
            SELECT (codigo_ibge // 10)::VARCHAR AS codigo_ibge, data, poluente,
                   unidade, valor, origem
            FROM read_parquet('{arquivos}', hive_partitioning = false);

            CREATE TABLE ar_mensal AS
            SELECT codigo_ibge, poluente, any_value(unidade) AS unidade,
                   strftime(data, '%Y-%m') AS mes, avg(valor) AS media,
                   min(valor) AS minimo, max(valor) AS maximo,
                   count(*)::INTEGER AS dias, any_value(origem) AS origem
            FROM {AR} GROUP BY codigo_ibge, poluente, mes;

            CREATE TABLE ar_extremos AS
            WITH e AS (
                SELECT codigo_ibge, poluente, max(maximo) AS maximo,
                       min(minimo) AS minimo
                FROM ar_mensal GROUP BY ALL
            )
            SELECT codigo_ibge, poluente, any_value(e.maximo) AS maximo,
                   max(data) FILTER (WHERE valor = e.maximo) AS data_maximo,
                   count(*) FILTER (WHERE valor = e.maximo)::INTEGER AS dias_maximo,
                   any_value(e.minimo) AS minimo,
                   max(data) FILTER (WHERE valor = e.minimo) AS data_minimo,
                   count(*) FILTER (WHERE valor = e.minimo)::INTEGER AS dias_minimo
            FROM {AR} JOIN e USING (codigo_ibge, poluente)
            WHERE valor = e.maximo OR valor = e.minimo
            GROUP BY ALL;
            """
        )
        ((meses,),) = self.con.execute(
            "SELECT count(DISTINCT mes) FROM ar_mensal"
        ).fetchall()
        log.info("%s: qualidade do ar pronta (%d meses)", AR, meses)

    def _materializar_queimadas(self, pasta: Path) -> None:
        """Focos por município e dia. O código do INPE tem 7 dígitos e vira o de
        6; o período coberto vale para todos os municípios, com ou sem focos."""
        arquivos = str(pasta / "*" / "*" / "dados.parquet").replace("'", "''")
        if not any(pasta.glob("*/*/dados.parquet")):
            log.warning("%s: sem focos de queimadas em %s", QUEIMADAS, pasta)
            self.con.execute(
                "CREATE TABLE focos_dia (codigo_ibge VARCHAR, data DATE, "
                "focos INTEGER);"
                "CREATE TABLE focos_bioma (codigo_ibge VARCHAR, bioma VARCHAR, "
                "focos INTEGER);"
                "CREATE TABLE focos_periodo (inicio DATE, fim TIMESTAMP)"
            )
            return
        self.con.execute(
            f"""
            CREATE VIEW {QUEIMADAS} AS
            SELECT (codigo_ibge // 10)::VARCHAR AS codigo_ibge, data_hora, bioma,
                   make_date(ano, mes::INTEGER, 1) AS mes
            FROM read_parquet('{arquivos}', hive_partitioning = true);

            CREATE TABLE focos_dia AS
            SELECT codigo_ibge, data_hora::DATE AS data, count(*)::INTEGER AS focos
            FROM {QUEIMADAS} GROUP BY ALL;

            CREATE TABLE focos_bioma AS
            SELECT codigo_ibge, bioma, count(*)::INTEGER AS focos
            FROM {QUEIMADAS} GROUP BY ALL;

            -- Meses com arquivo (mesmo sem focos) e o foco mais recente.
            CREATE TABLE focos_periodo AS
            SELECT min(mes) AS inicio, max(data_hora) AS fim FROM {QUEIMADAS};
            """
        )
        ((dias,),) = self.con.execute("SELECT count(*) FROM focos_dia").fetchall()
        log.info("%s: focos prontos (%d municípios-dia)", QUEIMADAS, dias)

    def _materializar_desmatamento(self, pasta: Path) -> None:
        """Um alerta por linha, com a área dentro do município (``city_area``),
        a faixa de tamanho e os cruzamentos já calculados."""
        registro = manifesto.ler(pasta / "manifesto.json").get("relatorio", {})
        self.desmatamento_atualizado = registro.get("last_update")
        arquivos = str(pasta / "*" / "dados.parquet").replace("'", "''")
        colunas_cruzamento = ", ".join(
            f"coalesce({condicao}, false) AS {nome}"
            for nome, condicao in CRUZAMENTOS.items()
        )
        tipos_cruzamento = ", ".join(f"{nome} BOOLEAN" for nome in CRUZAMENTOS)
        if not any(pasta.glob("*/dados.parquet")):
            log.warning("%s: sem alertas de desmatamento em %s", DESMATAMENTO, pasta)
            self.con.execute(
                "CREATE TABLE alertas (codigo_ibge VARCHAR, alerta BIGINT, "
                "data DATE, area_ha DOUBLE, area_municipio DOUBLE, faixa INTEGER, "
                f"bioma VARCHAR, {tipos_cruzamento})"
            )
            return
        faixa = " + ".join(f"(area_ha >= {limite})::INTEGER" for limite in FAIXAS_AREA)
        self.con.execute(
            f"""
            CREATE TABLE alertas AS
            SELECT (codigo_ibge // 10)::VARCHAR AS codigo_ibge, alert_code AS alerta,
                   detected_at AS data, area_ha, city_area AS area_municipio,
                   {faixa} AS faixa, biome AS bioma, {colunas_cruzamento}
            FROM read_parquet('{arquivos}', hive_partitioning = true)
            WHERE codigo_ibge IS NOT NULL
            ORDER BY codigo_ibge, data
            """
        )
        ((total,),) = self.con.execute("SELECT count(*) FROM alertas").fetchall()
        log.info("%s: %d alertas prontos", DESMATAMENTO, total)

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

    def qualidade_do_ar(self, codigo: str) -> dict[str, Any]:
        distrito_federal = codigo.startswith("53")
        if distrito_federal:
            codigo = BRASILIA
        cursor = self._cursor()
        cursor.execute(
            "SELECT poluente, unidade, mes, media, minimo, maximo, dias, origem "
            "FROM ar_mensal WHERE codigo_ibge = ? ORDER BY mes",
            [codigo],
        )
        meses = _linhas(cursor)
        cursor.execute(
            "SELECT * EXCLUDE (codigo_ibge) FROM ar_extremos WHERE codigo_ibge = ?",
            [codigo],
        )
        extremos = {e["poluente"]: e for e in _linhas(cursor)}

        poluentes = []
        for nome in POLUENTES:
            e = extremos.get(nome)
            if e is None:
                continue
            por_mes = [
                {
                    k: m[k]
                    for k in ("mes", "media", "minimo", "maximo", "dias", "origem")
                }
                for m in meses
                if m["poluente"] == nome
            ]
            poluentes.append(
                {
                    "poluente": nome,
                    "unidade": next(
                        m["unidade"] for m in meses if m["poluente"] == nome
                    ),
                    "maximo": {
                        "valor": e["maximo"],
                        "data": e["data_maximo"],
                        "dias": e["dias_maximo"],
                    },
                    "minimo": {
                        "valor": e["minimo"],
                        "data": e["data_minimo"],
                        "dias": e["dias_minimo"],
                    },
                    "por_mes": por_mes,
                }
            )
        return {"distrito_federal": distrito_federal, "poluentes": poluentes}

    def queimadas(self, codigo: str) -> dict[str, Any] | None:
        """None se não houver focos carregados para nenhum município."""
        distrito_federal = codigo.startswith("53")
        if distrito_federal:
            codigo = BRASILIA
        cursor = self._cursor()
        ((inicio, fim),) = cursor.execute(
            "SELECT min(inicio), max(fim) FROM focos_periodo"
        ).fetchall()
        if inicio is None:
            return None
        cursor.execute(
            "SELECT strftime(data, '%Y-%m') AS mes, sum(focos)::INTEGER AS focos "
            "FROM focos_dia WHERE codigo_ibge = ? GROUP BY mes ORDER BY mes",
            [codigo],
        )
        por_mes = _linhas(cursor)
        cursor.execute(
            "SELECT data, focos FROM focos_dia WHERE codigo_ibge = ? "
            "ORDER BY focos DESC, data DESC LIMIT 1",
            [codigo],
        )
        pior_dia = _linhas(cursor)
        cursor.execute(
            "SELECT bioma, focos FROM focos_bioma WHERE codigo_ibge = ? "
            "ORDER BY focos DESC",
            [codigo],
        )
        biomas = _linhas(cursor)
        pior_mes = max(por_mes, key=lambda m: (m["focos"], m["mes"]), default=None)
        return {
            "distrito_federal": distrito_federal,
            "inicio": inicio.strftime("%Y-%m"),
            "fim": fim.strftime("%Y-%m"),
            "atualizado_ate": fim.date(),
            "total": sum(m["focos"] for m in por_mes),
            "pior_mes": pior_mes,
            "pior_dia": pior_dia[0] if pior_dia else None,
            "biomas": biomas,
            "por_mes": por_mes,
        }

    def desmatamento(self, codigo: str) -> dict[str, Any] | None:
        """None se os alertas não foram carregados. Áreas em hectares, só a
        parte de cada alerta dentro do município."""
        distrito_federal = codigo.startswith("53")
        if distrito_federal:
            codigo = BRASILIA
        cursor = self._cursor()
        ((inicio, fim),) = cursor.execute(
            "SELECT min(data), max(data) FROM alertas"
        ).fetchall()
        if inicio is None:
            return None
        cursor.execute(
            "SELECT year(data) AS ano, count(*)::INTEGER AS alertas, "
            "sum(area_municipio) AS area_ha FROM alertas WHERE codigo_ibge = ? "
            "GROUP BY ano",
            [codigo],
        )
        anos = {a["ano"]: a for a in _linhas(cursor)}
        por_ano = [
            anos.get(ano, {"ano": ano, "alertas": 0, "area_ha": 0.0})
            for ano in range(inicio.year, fim.year + 1)
        ]
        cursor.execute(
            "SELECT faixa, count(*)::INTEGER AS alertas, "
            "sum(area_municipio) AS area_ha FROM alertas WHERE codigo_ibge = ? "
            "GROUP BY faixa",
            [codigo],
        )
        faixas = {f["faixa"]: f for f in _linhas(cursor)}
        limites = (0, *FAIXAS_AREA, None)
        tamanhos = [
            {
                "de": limites[i],
                "ate": limites[i + 1],
                "alertas": faixas.get(i, {}).get("alertas", 0),
                "area_ha": faixas.get(i, {}).get("area_ha", 0.0),
            }
            for i in range(len(FAIXAS_AREA) + 1)
        ]
        somas = ", ".join(
            f"count(*) FILTER (WHERE {n})::INTEGER, "
            f"coalesce(sum(area_municipio) FILTER (WHERE {n}), 0)"
            for n in CRUZAMENTOS
        )
        (valores,) = cursor.execute(
            f"SELECT {somas} FROM alertas WHERE codigo_ibge = ?", [codigo]
        ).fetchall()
        cruzamentos = [
            {
                "cruzamento": nome,
                "alertas": valores[2 * i],
                "area_ha": valores[2 * i + 1],
            }
            for i, nome in enumerate(CRUZAMENTOS)
        ]
        cursor.execute(
            "SELECT alerta, data, area_ha, area_municipio FROM alertas "
            "WHERE codigo_ibge = ? ORDER BY area_municipio DESC, data DESC LIMIT 1",
            [codigo],
        )
        maior = _linhas(cursor)
        cursor.execute(
            "SELECT bioma, sum(area_municipio) AS area_ha FROM alertas "
            "WHERE codigo_ibge = ? GROUP BY bioma ORDER BY area_ha DESC",
            [codigo],
        )
        biomas = _linhas(cursor)
        return {
            "distrito_federal": distrito_federal,
            "inicio": inicio.strftime("%Y-%m"),
            "fim": fim.strftime("%Y-%m"),
            "atualizado_em": self.desmatamento_atualizado,
            "alertas": sum(a["alertas"] for a in por_ano),
            "area_ha": sum(a["area_ha"] for a in por_ano),
            "maior": maior[0] if maior else None,
            "por_ano": por_ano,
            "tamanhos": tamanhos,
            "cruzamentos": cruzamentos,
            "biomas": biomas,
        }

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

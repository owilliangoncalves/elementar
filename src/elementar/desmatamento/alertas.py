"""Coleta os alertas de desmatamento validados do MapBiomas Alerta.

Fonte: a API da plataforma (``plataforma.alerta.mapbiomas.org/api/v2/graphql``),
com login de uma conta gratuita (``MAPBIOMAS_EMAIL`` e ``MAPBIOMAS_SENHA`` no
ambiente ou no ``.env``). A API entrega o relatório CSV com todos os alertas
publicados desde 2019, regerado periodicamente, com o seu MD5.

Cada alerta vem atribuído a um município, com ``city_area`` (a parte dele que
cai no município) e ``area_ha`` (o alerta inteiro). ``city_id`` é um código do
MapBiomas: o código IBGE vem do nome, escolhendo o município homônimo da UF que
mais aparece nos alertas daquele ``city_id`` (a UF do alerta nem sempre é a do
município, quando ele cruza a divisa).

Grava ``<dados>/parquet/bruto/desmatamento_alertas/ano=AAAA/dados.parquet``,
por ano de detecção, com todas as colunas do CSV mais ``codigo_ibge``. O
manifesto guarda o MD5 do relatório: sem mudança, nada é baixado.
"""

import argparse
import hashlib
import logging
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import duckdb
import httpx

from elementar.arquivos import manifesto
from elementar.arquivos.conversao import (
    arquivo_ano,
    gravar_parquet,
    literal,
    remover_anos_obsoletos,
)
from elementar.arquivos.trava import travar
from elementar.config import DADOS_PADRAO, configurar_log, segredo
from elementar.ibge import municipios_ibge, preparar_nomes

API = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql"
CABECALHOS = {
    "User-Agent": "elementar (+https://github.com/owilliangoncalves/elementar)"
}
TABELA = "desmatamento_alertas"
BLOCO = 1 << 20

# Município de cada city_id: o homônimo do IBGE (ou de um apelido) na UF que
# mais aparece nos alertas dele. Sem homônimo na UF de algum alerta, fica nulo.
CIDADES = """
CREATE TABLE cidades AS
WITH por_uf AS (
    SELECT city_id, any_value(city) AS city, norma(state) AS estado,
           count(*) AS n
    FROM csv GROUP BY city_id, norma(state)
),
nomes AS (
    SELECT nome, uf, codigo FROM municipios
    UNION ALL SELECT nome, uf, codigo FROM apelidos
),
candidatos AS (
    SELECT p.city_id, n.codigo,
           sum(p.n) FILTER (WHERE u.nome = p.estado) AS votos
    FROM por_uf AS p
    JOIN nomes AS n ON n.nome = norma(p.city)
    JOIN ufs AS u ON u.codigo = n.uf
    GROUP BY ALL
)
SELECT city_id, arg_max(codigo, votos) AS codigo_ibge
FROM candidatos WHERE votos > 0 GROUP BY city_id
"""

log = logging.getLogger(__name__)


class Api:
    """Chamadas GraphQL; o token do login vai no cabeçalho das seguintes."""

    def __init__(self, cliente: httpx.Client) -> None:
        self.cliente = cliente
        self.token: str | None = None

    def chamar(self, consulta: str, variaveis: dict | None = None) -> dict:
        cabecalhos = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        resposta = self.cliente.post(
            API,
            json={"query": consulta, "variables": variaveis or {}},
            headers=cabecalhos,
        )
        resposta.raise_for_status()
        corpo = resposta.json()
        if corpo.get("errors"):
            mensagens = "; ".join(e.get("message", "?") for e in corpo["errors"])
            raise RuntimeError(f"API do MapBiomas: {mensagens}")
        return corpo["data"]

    def entrar(self, email: str, senha: str) -> None:
        dados = self.chamar(
            "mutation($email: String!, $senha: String!) "
            "{ signIn(email: $email, password: $senha) { token } }",
            {"email": email, "senha": senha},
        )
        self.token = dados["signIn"]["token"]

    def relatorio(self) -> dict:
        """Link (assinado e temporário), MD5 e data do relatório CSV de alertas."""
        return self.chamar(
            "{ relatoryAlert(format: Csv, typename: Alerts) "
            "{ fileUrl md5 lastUpdate } }"
        )["relatoryAlert"]


def baixar(cliente: httpx.Client, url: str, destino: Path, md5: str) -> None:
    """Baixa sem registrar a URL (ela é assinada) e confere o MD5."""
    soma = hashlib.md5()
    temporario = destino.with_name(destino.name + ".tmp")
    with cliente.stream("GET", url) as resposta, temporario.open("wb") as f:
        # O erro do httpx traz a URL; aqui só o status vai para o log.
        if resposta.is_error:
            raise RuntimeError(f"download do relatório: HTTP {resposta.status_code}")
        for bloco in resposta.iter_bytes(BLOCO):
            soma.update(bloco)
            f.write(bloco)
    if soma.hexdigest() != md5:
        raise RuntimeError(f"MD5 do relatório não confere: {soma.hexdigest()}")
    temporario.rename(destino)


def converter(csv: Path, pasta_tabela: Path, ibge: Path) -> dict:
    """Grava os alertas por ano de detecção e devolve os dados do manifesto."""
    with duckdb.connect(csv.with_suffix(".duckdb")) as con:
        con.execute("SET preserve_insertion_order = false")
        preparar_nomes(con, ibge)
        con.execute(
            f"CREATE TABLE csv AS SELECT * FROM read_csv({literal(csv)}, "
            "header = true, sample_size = -1)"
        )
        con.execute(CIDADES)
        con.execute(
            "CREATE TABLE alertas AS SELECT csv.*, c.codigo_ibge "
            "FROM csv LEFT JOIN cidades AS c USING (city_id)"
        )
        faltas = con.execute(
            "SELECT city, state, count(*) AS n FROM alertas "
            "WHERE codigo_ibge IS NULL GROUP BY ALL ORDER BY n DESC"
        ).fetchall()
        sem_municipio = sum(n for *_, n in faltas)
        if sem_municipio:
            log.warning(
                "%s: %d alertas sem código IBGE em %d municípios; %s",
                TABELA,
                sem_municipio,
                len(faltas),
                ", ".join(f"{m} ({e}): {n}" for m, e, n in faltas[:10]),
            )
        anos = [
            a
            for (a,) in con.execute(
                "SELECT DISTINCT detected_year FROM alertas ORDER BY 1"
            ).fetchall()
        ]
        if None in anos:
            raise RuntimeError(f"{TABELA}: há alertas sem detected_year")
        for ano in anos:
            gravar_parquet(
                con,
                f"SELECT * FROM alertas WHERE detected_year = {ano} "
                "ORDER BY detected_at, alert_code",
                arquivo_ano(pasta_tabela, ano),
            )
        remover_anos_obsoletos(pasta_tabela, set(anos))
        ((linhas,),) = con.execute("SELECT count(*) FROM alertas").fetchall()
    return {"linhas": linhas, "anos": anos, "sem_municipio": sem_municipio}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--forcar", action="store_true", help="ignora o manifesto e baixa de novo"
    )
    args = parser.parse_args()
    configurar_log()
    # O httpx registra cada URL em INFO, e a do relatório é assinada.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    pasta_tabela = args.dados / "parquet" / "bruto" / TABELA
    caminho_manifesto = pasta_tabela / "manifesto.json"
    email, senha = segredo("MAPBIOMAS_EMAIL"), segredo("MAPBIOMAS_SENHA")

    with (
        httpx.Client(
            headers=CABECALHOS,
            timeout=httpx.Timeout(60, read=300),
            follow_redirects=True,
        ) as cliente,
        travar(pasta_tabela),
    ):
        api = Api(cliente)
        api.entrar(email, senha)
        relatorio = api.relatorio()
        log.info("%s: relatório de %s", TABELA, relatorio["lastUpdate"])

        registros = manifesto.ler(caminho_manifesto)
        registro = registros.get("relatorio")
        if (
            not args.forcar
            and registro
            and registro["md5"] == relatorio["md5"]
            and all(arquivo_ano(pasta_tabela, a).exists() for a in registro["anos"])
        ):
            log.info("%s: sem mudanças desde %s", TABELA, registro["last_update"])
            return

        ibge = municipios_ibge(cliente, pasta_tabela / "municipios_ibge.json")
        temporaria = args.dados / "tmp"
        temporaria.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporaria) as trabalho:
            csv = Path(trabalho) / "alertas.csv"
            log.info("%s: baixando o relatório", TABELA)
            try:
                baixar(cliente, relatorio["fileUrl"], csv, relatorio["md5"])
                resultado = converter(csv, pasta_tabela, ibge)
            except Exception:
                log.exception("%s: falha", TABELA)
                sys.exit("Atualização interrompida")

        registros["relatorio"] = {
            "md5": relatorio["md5"],
            "last_update": relatorio["lastUpdate"],
            **resultado,
            "atualizado_em": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        manifesto.gravar(caminho_manifesto, registros)
        log.info("%s: %d alertas gravados", TABELA, resultado["linhas"])


if __name__ == "__main__":
    main()

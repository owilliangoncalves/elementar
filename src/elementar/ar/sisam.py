"""Baixa da API do SISAM (INPE) os poluentes diários por município, em Parquet mensal.

A API não é documentada: é a que o site https://data.inpe.br/queimadas/sisam usa.

- reanálise: valor diário de cada município, pedido por UF e poluente. Aceita
  até 31 dias por chamada; acima disso devolve vazio, sem erro;
- previsão: valor do próprio dia (``forecast0``) de todos os municípios,
  pedido por dia e poluente.

``<dados>/parquet/bruto/ar_sisam/ano=AAAA/mes=MM/dados.parquet``: valor por dia,
município e poluente, a partir do primeiro ano da vigilância da água
(``arquivos.toml``). Cada mês vem da reanálise se ela o cobre inteiro e, senão,
da previsão, até ontem.

O manifesto (``ar_sisam/manifesto.json``) guarda a origem e o último dia de cada
mês, e reexecuções só pedem o que falta: meses em dia são pulados, o mês da
previsão em andamento recebe só os dias novos e os meses da previsão são
refeitos com a reanálise quando ela os cobre. O Parquet é gravado antes do
manifesto, e por renomeação: uma execução interrompida refaz aquele mês na
próxima, com o mesmo resultado.

As chamadas são sequenciais, uma por segundo, e a execução para na primeira
falha. Resposta vazia onde deveria haver dados também é falha, porque a API
não avisa quando um pedido é inválido.
"""

import argparse
import logging
import sys
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import duckdb
import httpx
import pandas as pd

from elementar.ar.periodo import arquivo_mes, atualizado, mes, meses, ultimo_dia
from elementar.arquivos import manifesto
from elementar.arquivos.conversao import gravar_parquet, literal
from elementar.arquivos.fontes import carregar_arquivos
from elementar.arquivos.trava import travar
from elementar.config import DADOS_PADRAO, configurar_log

BASE = "https://data.inpe.br/queimadas/sisam"
CABECALHOS = {
    "Referer": f"{BASE}/",
    "User-Agent": "elementar (+https://github.com/owilliangoncalves/elementar)",
}
INTERVALO = 1.0  # segundos entre chamadas
TENTATIVAS = 5
TABELA = "ar_sisam"
UFS = (
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
    "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
)  # fmt: skip

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Poluente:
    endpoint: str  # pm25, pm10, o3, no2, so2, co
    unidade: str
    campo_dados: str  # chave da resposta da previsão (ex.: pm25_data)


@dataclass(frozen=True)
class Config:
    poluentes: tuple[Poluente, ...]
    inicio_reanalise: date
    fim_reanalise: date
    inicio_previsao: date


class Api:
    """Cliente com intervalo mínimo entre chamadas e nova tentativa só em erro
    temporário (timeout, 429 ou 5xx)."""

    def __init__(self, cliente: httpx.Client) -> None:
        self.cliente = cliente
        self.ultima = 0.0

    def get(self, rota: str, params: dict | None = None) -> dict:
        for tentativa in range(1, TENTATIVAS + 1):
            espera = self.ultima + INTERVALO - time.monotonic()
            if espera > 0:
                time.sleep(espera)
            self.ultima = time.monotonic()
            try:
                resposta = self.cliente.get(rota, params=params)
                resposta.raise_for_status()
                return resposta.json()
            except httpx.HTTPStatusError as erro:
                codigo = erro.response.status_code
                if (codigo != 429 and codigo < 500) or tentativa == TENTATIVAS:
                    raise
                motivo = f"HTTP {codigo}"
            except httpx.TransportError as erro:
                if tentativa == TENTATIVAS:
                    raise
                motivo = repr(erro)
            espera = 5 * 2**tentativa
            log.warning("%s: %s; nova tentativa em %ds", rota, motivo, espera)
            time.sleep(espera)
        raise AssertionError("inalcançável")


def configuracao(api: Api) -> Config:
    previsao = api.get("/api/previsao/config")
    periodos = api.get("/api/downloads/config")["period_types"]
    return Config(
        tuple(
            Poluente(p["endpoint"], p["unit"], p["data_field"])
            for p in previsao["pollutants"]
        ),
        date.fromisoformat(periodos["reanalyze"]["min"]),
        date.fromisoformat(periodos["reanalyze"]["max"]),
        date.fromisoformat(periodos["forecast"]["min"]),
    )


def valores(registros: list[dict], sufixo: str) -> list[tuple[int, str, float]]:
    """(código IBGE, data, valor) dos registros com valor; o campo do valor muda
    por poluente (ex.: ``pm2_5_reanalise``, ``co_forecast_0``)."""
    if not registros:
        return []
    campos = [c for c in registros[0] if c.endswith(sufixo)]
    if len(campos) != 1:
        raise RuntimeError(
            f"esperava 1 campo *{sufixo}, encontrei {list(registros[0])}"
        )
    (campo,) = campos
    return [
        (int(r["CD_MUN"]), r["data"][:10], r[campo])
        for r in registros
        if r[campo] is not None
    ]


def reanalise(api: Api, poluente: Poluente, inicio: date, fim: date) -> list[tuple]:
    linhas = []
    for uf in UFS:
        resposta = api.get(
            "/api/reanalise/map",
            {
                "estado": uf,
                "data_inicio": f"{inicio.isoformat()}000000",
                "data_fim": f"{fim.isoformat()}235959",
                "poluente": poluente.endpoint,
            },
        )
        da_uf = valores(resposta["municipios"], "_reanalise")
        if not da_uf:
            raise RuntimeError(f"reanálise {poluente.endpoint} {uf} {inicio}: vazia")
        linhas += da_uf
    return linhas


def previsao(api: Api, poluente: Poluente, inicio: date, fim: date) -> list[tuple]:
    linhas, dia = [], inicio
    while dia <= fim:
        resposta = api.get(
            f"/api/pollution/{poluente.endpoint}",
            {"data": dia.isoformat(), "forecast": "forecast0"},
        )
        do_dia = valores(resposta[poluente.campo_dados]["municipios"], "_forecast_0")
        if not do_dia:
            raise RuntimeError(f"previsão {poluente.endpoint} {dia}: vazia")
        linhas += do_dia
        dia += timedelta(days=1)
    return linhas


ORIGENS = {"reanalise": reanalise, "previsao": previsao}


def inicio_da_agua() -> date:
    """1º de janeiro do primeiro ano da vigilância da água (``ano_inicial``)."""
    return date(min(a.ano for a in carregar_arquivos() if a.ano is not None), 1, 1)


def plano(primeiro: date, config: Config, ontem: date) -> tuple[str, date] | None:
    """Origem e último dia a pedir para o mês, ou None se não há dados."""
    ultimo = ultimo_dia(primeiro)
    if primeiro < config.inicio_reanalise:
        return None
    if ultimo <= config.fim_reanalise:
        return "reanalise", ultimo
    if primeiro < config.inicio_previsao:
        return None
    ate = min(ultimo, ontem)
    return ("previsao", ate) if ate >= primeiro else None


def retomada(
    registro: dict | None, arquivo: Path, origem: str, primeiro: date, ate: date
) -> date:
    """Primeiro dia a pedir: na previsão em andamento, o dia seguinte ao último
    gravado; nos outros casos, o mês inteiro."""
    if (
        origem == "previsao"
        and registro
        and registro.get("origem") == origem
        and arquivo.exists()
    ):
        seguinte = date.fromisoformat(registro["ate"]) + timedelta(days=1)
        if primeiro < seguinte <= ate:
            return seguinte
    return primeiro


def processar(
    api: Api,
    config: Config,
    origem: str,
    primeiro: date,
    desde: date,
    ate: date,
    destino: Path,
) -> int:
    """Pede ``desde``..``ate`` e grava o mês. Com ``desde`` depois do dia 1, os
    dias anteriores vêm do Parquet já gravado."""
    partes = []
    for poluente in config.poluentes:
        log.info("%s: %s %s de %s a %s", TABELA, origem, poluente.endpoint, desde, ate)
        linhas = ORIGENS[origem](api, poluente, desde, ate)
        parte = pd.DataFrame(linhas, columns=["codigo_ibge", "data", "valor"])
        parte["poluente"] = poluente.endpoint
        parte["unidade"] = poluente.unidade
        partes.append(parte)
    tabela = pd.concat(partes, ignore_index=True)

    dias = (ate - desde).days + 1
    incompletos = tabela.groupby("poluente")["data"].nunique() < dias
    if incompletos.any():
        log.warning(
            "%s %s: dias faltando em %s",
            TABELA,
            primeiro,
            list(incompletos[incompletos].index),
        )

    selecao = (
        "SELECT CAST(codigo_ibge AS INTEGER) AS codigo_ibge, "
        "CAST(data AS DATE) AS data, poluente, unidade, "
        f"CAST(valor AS DOUBLE) AS valor, {literal(origem)} AS origem FROM tabela"
    )
    if desde > primeiro:
        # A leitura termina antes da renomeação: dá para reescrever o mesmo arquivo.
        selecao += (
            " UNION ALL SELECT codigo_ibge, data, poluente, unidade, valor, origem "
            f"FROM read_parquet({literal(destino)}) "
            f"WHERE data < {literal(desde.isoformat())}::DATE"
        )
    with duckdb.connect() as con:
        con.register("tabela", tabela)
        gravar_parquet(con, f"{selecao} ORDER BY codigo_ibge, data, poluente", destino)
        ((linhas,),) = con.execute(
            f"SELECT count(*) FROM read_parquet({literal(destino)})"
        ).fetchall()
    return linhas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--inicio",
        type=mes,
        default=inicio_da_agua(),
        help="AAAA-MM (padrão: primeiro ano da vigilância da água)",
    )
    parser.add_argument(
        "--fim", type=mes, default=date.today(), help="AAAA-MM (padrão: mês corrente)"
    )
    parser.add_argument(
        "--forcar", action="store_true", help="ignora o manifesto e refaz os meses"
    )
    args = parser.parse_args()
    configurar_log()

    pasta_tabela = args.dados / "parquet" / "bruto" / TABELA
    caminho_manifesto = pasta_tabela / "manifesto.json"

    with (
        httpx.Client(base_url=BASE, headers=CABECALHOS, timeout=120) as cliente,
        travar(pasta_tabela),
    ):
        api = Api(cliente)
        config = configuracao(api)
        log.info(
            "%s: reanálise de %s a %s, previsão desde %s",
            TABELA,
            config.inicio_reanalise,
            config.fim_reanalise,
            config.inicio_previsao,
        )

        registros = manifesto.ler(caminho_manifesto)
        # O dia de hoje pode ainda não ter sido publicado.
        ontem = date.today() - timedelta(days=1)
        for primeiro in meses(args.inicio, args.fim):
            passo = plano(primeiro, config, ontem)
            if passo is None:
                continue
            origem, ate = passo
            chave = primeiro.strftime("%Y-%m")
            arquivo = arquivo_mes(pasta_tabela, primeiro)
            registro = None if args.forcar else registros.get(chave)
            if atualizado(registro, arquivo, origem, ate):
                continue
            desde = retomada(registro, arquivo, origem, primeiro, ate)
            try:
                linhas = processar(api, config, origem, primeiro, desde, ate, arquivo)
            except Exception:
                log.exception("%s %s: falha", TABELA, chave)
                sys.exit(f"Atualização interrompida em {chave}")
            registros[chave] = {
                "origem": origem,
                "ate": ate.isoformat(),
                "linhas": linhas,
                "atualizado_em": datetime.now(UTC).isoformat(timespec="seconds"),
            }
            # Grava a cada mês, para não perder o progresso.
            manifesto.gravar(caminho_manifesto, registros)
            log.info("%s %s: %d linhas gravadas", TABELA, chave, linhas)


if __name__ == "__main__":
    main()

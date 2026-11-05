"""Coleta os dados das URLs listadas em endpoints.toml.

As URLs são coletadas em paralelo (uma thread por URL) e cada página da API
é salva como NDJSON comprimido em ``<dados>/raw/``. Páginas já baixadas são
puladas, então a coleta pode ser retomada.
"""

import argparse
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

from elementar import bruto
from elementar.config import (
    DADOS_PADRAO,
    Recurso,
    carregar_recursos,
    configurar_log,
    raiz_bruta,
)

LIMITE = 1000  # máximo de registros por página aceito pela API
TENTATIVAS = 5

log = logging.getLogger(__name__)


def extrair_registros(dados: dict | list) -> list[dict]:
    """A API embrulha a lista de registros em uma chave (ex.: ``parametros``)."""
    if isinstance(dados, list):
        return dados
    listas = [valor for valor in dados.values() if isinstance(valor, list)]
    if len(listas) != 1:
        raise RuntimeError(f"Resposta inesperada, chaves: {list(dados)}")
    return listas[0]


def buscar_pagina(cliente: httpx.Client, url: str, offset: int) -> list[dict]:
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            resposta = cliente.get(url, params={"limit": LIMITE, "offset": offset})
            resposta.raise_for_status()
            return extrair_registros(resposta.json())
        except (httpx.HTTPError, json.JSONDecodeError) as erro:
            if tentativa == TENTATIVAS:
                raise
            espera = 2**tentativa
            log.warning("offset %d: %s; nova tentativa em %ds", offset, erro, espera)
            time.sleep(espera)
    raise AssertionError("inalcançável")


def coletar(
    recurso: Recurso, cliente: httpx.Client, raiz: Path, max_paginas: int | None
) -> None:
    pasta = recurso.pasta(raiz)
    pasta.mkdir(parents=True, exist_ok=True)
    pagina = 0
    while max_paginas is None or pagina < max_paginas:
        arquivo = bruto.arquivo_pagina(pasta, pagina)
        if arquivo.exists():
            total = bruto.contar_linhas(arquivo)
        else:
            registros = buscar_pagina(cliente, recurso.url, pagina * LIMITE)
            total = len(registros)
            if total:
                bruto.salvar_pagina(arquivo, registros)
            log.info("%s: página %d (%d registros)", recurso.tabela, pagina, total)
        if total < LIMITE:
            break
        pagina += 1


def coletar_todos(
    recursos: list[Recurso], raiz: Path, max_paginas: int | None
) -> list[str]:
    """Coleta cada URL em uma thread própria e devolve as tabelas que falharam."""
    falhas = []
    with (
        httpx.Client(timeout=120) as cliente,
        ThreadPoolExecutor(max_workers=len(recursos) or 1) as executor,
    ):
        futuros = {
            executor.submit(coletar, recurso, cliente, raiz, max_paginas): recurso
            for recurso in recursos
        }
        for futuro in as_completed(futuros):
            recurso = futuros[futuro]
            try:
                futuro.result()
            except Exception:
                log.exception("%s: coleta interrompida", recurso.tabela)
                falhas.append(recurso.tabela)
            else:
                log.info("%s: coleta concluída", recurso.tabela)
    return falhas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de saída (padrão: data)"
    )
    parser.add_argument(
        "--max-paginas", type=int, help="limita as páginas por URL (útil para testes)"
    )
    args = parser.parse_args()
    configurar_log()

    falhas = coletar_todos(
        carregar_recursos(), raiz_bruta(args.dados), args.max_paginas
    )
    if falhas:
        sys.exit(f"Coleta incompleta: {', '.join(falhas)}")


if __name__ == "__main__":
    main()

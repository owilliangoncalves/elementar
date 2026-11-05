"""Camada servida: Parquet só com os campos do endpoints.toml, com nomes da API.

Gerada a partir da camada bruta, sem acessar a rede. Sempre regera todos os
anos, então mudanças em ``campos`` ou no mapeamento valem na próxima execução.
"""

import argparse
import logging
import sys
from pathlib import Path

import duckdb

from elementar.arquivos.conversao import (
    gravar_parquet,
    identificador,
    literal,
    remover_anos_obsoletos,
)
from elementar.arquivos.fontes import Tabela, carregar_tabelas
from elementar.arquivos.trava import travar
from elementar.config import DADOS_PADRAO, configurar_log

log = logging.getLogger(__name__)


def colunas_parquet(con: duckdb.DuckDBPyConnection, arquivo: Path) -> set[str]:
    linhas = con.execute(
        f"DESCRIBE FROM read_parquet({literal(arquivo)}, hive_partitioning = false)"
    ).fetchall()
    return {nome for (nome, *_) in linhas}


def gerar(tabela: Tabela, bruto: Path, servido: Path) -> None:
    arquivos = sorted((bruto / tabela.nome).glob("ano=*/dados.parquet"))
    if not arquivos:
        log.warning("%s: nenhum Parquet bruto em %s", tabela.nome, bruto / tabela.nome)
        return

    destino = servido / tabela.nome
    selecao = ", ".join(
        f"{identificador(coluna)} AS {identificador(campo)}"
        for campo, coluna in tabela.colunas
    )
    with duckdb.connect() as con:
        for arquivo in arquivos:
            faltando = [
                c for _, c in tabela.colunas if c not in colunas_parquet(con, arquivo)
            ]
            if faltando:
                raise RuntimeError(f"{arquivo}: colunas ausentes no bruto: {faltando}")
            gravar_parquet(
                con,
                f"SELECT {selecao} FROM read_parquet({literal(arquivo)}, "
                "hive_partitioning = false)",
                destino / arquivo.parent.name / arquivo.name,
            )
    remover_anos_obsoletos(
        destino, {int(a.parent.name.removeprefix("ano=")) for a in arquivos}
    )
    log.info("%s: camada servida gerada (%d anos)", tabela.nome, len(arquivos))


def gerar_todas(
    bruto: Path, servido: Path, nomes: list[str] | None = None
) -> list[str]:
    """Gera a camada servida e devolve as tabelas que falharam."""
    falhas = []
    for tabela in carregar_tabelas():
        if nomes and tabela.nome not in nomes:
            continue
        try:
            gerar(tabela, bruto, servido)
        except Exception:
            log.exception("%s: falha na camada servida", tabela.nome)
            falhas.append(tabela.nome)
    return falhas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--tabela", action="append", help="processa só esta tabela (pode repetir)"
    )
    args = parser.parse_args()
    configurar_log()

    raiz = args.dados / "parquet"
    with travar(raiz):
        falhas = gerar_todas(raiz / "bruto", raiz / "servido", args.tabela)
    if falhas:
        sys.exit(f"Camada servida incompleta: {', '.join(falhas)}")


if __name__ == "__main__":
    main()

"""Carrega os arquivos brutos da coleta em DuckDB.

Gera ``<dados>/elementar.duckdb`` com uma tabela por URL do endpoints.toml,
mantendo apenas as colunas listadas em ``campos``. Não acessa a API.
"""

import argparse
import logging
from pathlib import Path

import duckdb

from elementar import bruto
from elementar.config import (
    DADOS_PADRAO,
    Recurso,
    caminho_banco,
    carregar_recursos,
    configurar_log,
    raiz_bruta,
)

log = logging.getLogger(__name__)


def carregar_duckdb(
    con: duckdb.DuckDBPyConnection, recurso: Recurso, raiz: Path
) -> None:
    pasta = recurso.pasta(raiz)
    if not bruto.listar(pasta):
        log.warning("%s: nenhum arquivo bruto em %s", recurso.tabela, pasta)
        return
    padrao = str(pasta / bruto.PADRAO).replace("'", "''")
    # Tudo como VARCHAR: a API mistura formatos (ex.: resultado "0,1") e
    # colunas inteiramente nulas em uma página quebrariam a inferência de tipos.
    colunas = ", ".join(f"'{campo}': 'VARCHAR'" for campo in recurso.campos)
    con.execute(
        f"CREATE OR REPLACE TABLE {recurso.tabela} AS "
        f"SELECT * FROM read_json('{padrao}', format = 'newline_delimited', "
        f"columns = {{{colunas}}})"
    )
    ((linhas,),) = con.execute(f"SELECT count(*) FROM {recurso.tabela}").fetchall()
    log.info("%s: %d linhas carregadas", recurso.tabela, linhas)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    args = parser.parse_args()
    configurar_log()

    args.dados.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(caminho_banco(args.dados)) as con:
        for recurso in carregar_recursos():
            carregar_duckdb(con, recurso, raiz_bruta(args.dados))


if __name__ == "__main__":
    main()

"""Baixa os CSVs do OpenDataSUS listados em arquivos.toml e gera Parquet por ano.

Resultado em ``<dados>/parquet/<tabela>/ano=AAAA/dados.parquet``. O manifesto
(``<dados>/parquet/manifesto.json``) guarda o ETag de cada arquivo remoto, e
reexecuções só baixam o que mudou na fonte.
"""

import argparse
import fcntl
import logging
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import httpx

from elementar.arquivos import manifesto
from elementar.arquivos.conversao import arquivo_ano, converter
from elementar.arquivos.download import NaoPublicado, baixar, extrair_csv
from elementar.arquivos.fontes import Arquivo, carregar_arquivos
from elementar.config import DADOS_PADRAO, configurar_log

log = logging.getLogger(__name__)


def atualizado(registro: dict | None, pasta_tabela: Path) -> bool:
    """O manifesto só vale se os Parquet que ele cita ainda existem."""
    return bool(registro) and all(
        arquivo_ano(pasta_tabela, ano).exists() for ano in registro["anos"]
    )


def processar(
    arquivo: Arquivo,
    cliente: httpx.Client,
    registros: dict[str, dict],
    raiz: Path,
    temporaria: Path,
    forcar: bool,
) -> None:
    pasta_tabela = raiz / arquivo.tabela
    registro = registros.get(arquivo.url)
    etag = (
        registro["etag"] if not forcar and atualizado(registro, pasta_tabela) else None
    )

    temporaria.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=temporaria) as trabalho:
        trabalho = Path(trabalho)
        zip_ = trabalho / arquivo.url.rsplit("/", 1)[-1]
        log.info("%s: baixando %s", arquivo.rotulo, arquivo.url)
        versao = baixar(cliente, arquivo.url, zip_, etag)
        if versao is None:
            log.info(
                "%s: sem mudanças desde %s", arquivo.rotulo, registro["last_modified"]
            )
            return

        csv = extrair_csv(zip_, trabalho)
        zip_.unlink()  # libera espaço antes da conversão
        log.info("%s: convertendo %s", arquivo.rotulo, csv.name)
        resultado = converter(
            csv, pasta_tabela, arquivo.rotulo, arquivo.ano, arquivo.coluna_ano
        )

    registros[arquivo.url] = {
        "tabela": arquivo.tabela,
        "etag": versao.etag,
        "last_modified": versao.last_modified,
        "linhas": resultado.linhas,
        "anos": resultado.anos,
        "atualizado_em": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    log.info("%s: %d linhas gravadas", arquivo.rotulo, resultado.linhas)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--tabela", action="append", help="processa só esta tabela (pode repetir)"
    )
    parser.add_argument(
        "--forcar", action="store_true", help="ignora o manifesto e baixa tudo"
    )
    args = parser.parse_args()
    configurar_log()

    raiz = args.dados / "parquet"
    raiz.mkdir(parents=True, exist_ok=True)
    caminho_manifesto = raiz / "manifesto.json"

    arquivos = carregar_arquivos()
    if args.tabela:
        arquivos = [a for a in arquivos if a.tabela in args.tabela]
        if not arquivos:
            sys.exit(f"Nenhuma tabela encontrada: {args.tabela}")

    with (raiz / ".lock").open("w") as trava:
        try:
            fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit("Outra atualização já está em andamento")

        registros = manifesto.ler(caminho_manifesto)
        falhas = []
        with httpx.Client(timeout=httpx.Timeout(60, read=300)) as cliente:
            for arquivo in arquivos:
                try:
                    processar(
                        arquivo,
                        cliente,
                        registros,
                        raiz,
                        args.dados / "tmp",
                        args.forcar,
                    )
                except NaoPublicado:
                    log.warning("%s: arquivo ainda não publicado", arquivo.rotulo)
                except Exception:
                    log.exception("%s: falha", arquivo.rotulo)
                    falhas.append(arquivo.rotulo)
                else:
                    # Grava a cada arquivo, para não perder o progresso.
                    manifesto.gravar(caminho_manifesto, registros)

    if falhas:
        sys.exit(f"Atualização incompleta: {', '.join(falhas)}")


if __name__ == "__main__":
    main()

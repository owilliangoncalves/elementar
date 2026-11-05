"""Download dos arquivos zipados, só quando mudaram (ETag), e extração do CSV."""

import codecs
import io
import logging
import shutil
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

TENTATIVAS = 3
BLOCO = 1 << 20

log = logging.getLogger(__name__)


class NaoPublicado(Exception):
    """O arquivo ainda não existe no servidor (ex.: ano corrente sem dados)."""


@dataclass(frozen=True)
class Versao:
    etag: str | None
    last_modified: str | None


def baixar(
    cliente: httpx.Client, url: str, destino: Path, etag: str | None
) -> Versao | None:
    """Baixa ``url`` em ``destino``. Devolve None se o ETag não mudou."""
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            return _baixar(cliente, url, destino, etag)
        except httpx.HTTPError as erro:
            if tentativa == TENTATIVAS:
                raise
            espera = 5 * 2**tentativa
            log.warning("%s: %s; nova tentativa em %ds", url, erro, espera)
            time.sleep(espera)
    raise AssertionError("inalcançável")


def _baixar(
    cliente: httpx.Client, url: str, destino: Path, etag: str | None
) -> Versao | None:
    cabecalhos = {"If-None-Match": etag} if etag else {}
    with cliente.stream("GET", url, headers=cabecalhos) as resposta:
        if resposta.status_code == 304:
            return None
        # O bucket responde 403 (e não 404) para arquivos inexistentes.
        if resposta.status_code in (403, 404):
            raise NaoPublicado(url)
        resposta.raise_for_status()

        temporario = destino.with_name(destino.name + ".tmp")
        with temporario.open("wb") as f:
            for bloco in resposta.iter_raw(BLOCO):
                f.write(bloco)

        esperado = resposta.headers.get("content-length")
        if esperado and temporario.stat().st_size != int(esperado):
            raise httpx.TransportError(
                f"download incompleto: {temporario.stat().st_size} de {esperado} bytes"
            )
        temporario.rename(destino)
        return Versao(
            resposta.headers.get("etag"), resposta.headers.get("last-modified")
        )


def _bytes_fora_do_cp1252(erro: UnicodeDecodeError) -> tuple[str, int]:
    # 0x81, 0x8D, 0x8F, 0x90 e 0x9D não existem no cp1252; mantém como latin-1.
    return erro.object[erro.start : erro.end].decode("latin-1"), erro.end


codecs.register_error("cp1252_latin1", _bytes_fora_do_cp1252)


def extrair_csv(zip_: Path, destino: Path) -> Path:
    """Extrai o CSV do zip convertendo de cp1252 (Windows) para UTF-8.

    O OpenDataSUS publica em cp1252: além dos acentos do latin-1, aparecem
    caracteres como "–" (0x96) e "’" (0x92), que o DuckDB não aceita em latin-1.
    """
    with zipfile.ZipFile(zip_) as arquivo:
        csvs = [n for n in arquivo.namelist() if n.lower().endswith(".csv")]
        if len(csvs) != 1:
            raise RuntimeError(f"{zip_.name}: esperava 1 CSV, encontrei {csvs}")
        csv = destino / Path(csvs[0]).name
        with (
            arquivo.open(csvs[0]) as origem,
            io.TextIOWrapper(
                origem, encoding="cp1252", errors="cp1252_latin1", newline=""
            ) as texto,
            csv.open("w", encoding="utf-8", newline="") as saida,
        ):
            shutil.copyfileobj(texto, saida, BLOCO)
    return csv

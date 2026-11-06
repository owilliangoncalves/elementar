"""Leitura do endpoints.toml e caminhos compartilhados entre as etapas."""

import logging
import os
import re
import tomllib
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ENDPOINTS_TOML = Path(__file__).parent / "endpoints" / "endpoints.toml"
DADOS_PADRAO = Path("data")


@dataclass(frozen=True)
class Recurso:
    fonte: str
    nome: str
    url: str
    campos: list[str]

    @property
    def tabela(self) -> str:
        return f"{self.fonte}_{slug(self.nome)}"

    def pasta(self, raiz: Path) -> Path:
        return raiz / self.fonte / slug(self.nome)


def slug(texto: str) -> str:
    sem_acentos = (
        unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    )
    return re.sub(r"[^a-z0-9]+", "_", sem_acentos.lower()).strip("_")


def carregar_recursos(caminho: Path = ENDPOINTS_TOML) -> list[Recurso]:
    with caminho.open("rb") as f:
        config = tomllib.load(f)["endpoints"]
    return [
        Recurso(fonte, url["name"], url["endpoint"], url["campos"])
        for fonte, secao in config.items()
        if isinstance(secao, dict)
        for url in secao.get("urls", [])
    ]


def raiz_bruta(dados: Path) -> Path:
    return dados / "raw"


def caminho_banco(dados: Path) -> Path:
    return dados / "elementar.duckdb"


def configurar_log() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )


def segredo(nome: str, env: Path = Path(".env")) -> str:
    """Variável de ambiente ou, se faltar, a linha ``NOME=valor`` do ``.env``."""
    if valor := os.environ.get(nome):
        return valor
    if env.exists():
        for linha in env.read_text(encoding="utf-8").splitlines():
            chave, igual, valor = linha.partition("=")
            if (
                igual
                and chave.strip() == nome
                and (valor := valor.strip().strip("\"'"))
            ):
                return valor
    raise SystemExit(f"Defina {nome} no ambiente ou no arquivo .env")

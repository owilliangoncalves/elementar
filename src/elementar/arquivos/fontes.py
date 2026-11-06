"""Leitura do arquivos.toml: quais arquivos baixar, como dividi-los por ano e
quais colunas expor na camada servida."""

import tomllib
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from elementar.config import carregar_recursos

ARQUIVOS_TOML = Path(__file__).parent.parent / "endpoints" / "arquivos.toml"


@dataclass(frozen=True)
class Arquivo:
    """Um arquivo remoto. Anual (``ano``) ou único dividido por ``coluna_ano``."""

    tabela: str
    url: str
    ano: int | None = None
    coluna_ano: str | None = None

    @property
    def rotulo(self) -> str:
        return f"{self.tabela} {self.ano}" if self.ano else self.tabela


@dataclass(frozen=True)
class Tabela:
    """Colunas da camada servida: pares (campo do endpoints.toml, coluna do CSV)."""

    nome: str
    colunas: tuple[tuple[str, str], ...]


def _itens(caminho: Path) -> list[tuple[str, dict, dict]]:
    with caminho.open("rb") as f:
        config = tomllib.load(f)
    return [
        (fonte, secao, item)
        for fonte, secao in config.items()
        for item in secao.get("arquivos", [])
    ]


def carregar_tabelas(caminho: Path = ARQUIVOS_TOML) -> list[Tabela]:
    """Liga cada arquivo ao seu endpoint e monta as colunas na ordem dos campos."""
    campos_por_url = {r.url: r.campos for r in carregar_recursos()}
    tabelas = []
    for fonte, _, item in _itens(caminho):
        if "endpoint" not in item:
            continue
        nome = f"{fonte}_{item['name']}"
        if item["endpoint"] not in campos_por_url:
            raise ValueError(f"{nome}: endpoint ausente do endpoints.toml")
        campos = campos_por_url[item["endpoint"]]
        mapa = item.get("colunas", {})
        sem_coluna = [c for c in campos if c not in mapa]
        if sem_coluna:
            raise ValueError(
                f"{nome}: campos sem coluna no arquivos.toml: {sem_coluna}"
            )
        tabelas.append(Tabela(nome, tuple((c, mapa[c]) for c in campos)))
    return tabelas


def carregar_arquivos(
    caminho: Path = ARQUIVOS_TOML, ano_final: int | None = None
) -> list[Arquivo]:
    ano_final = ano_final or date.today().year

    arquivos = []
    for fonte, secao, item in _itens(caminho):
        tabela = f"{fonte}_{item['name']}"
        url = f"{secao['base']}/{item['arquivo']}"
        if "ano_inicial" in item:
            arquivos += [
                Arquivo(tabela, url.format(ano=ano), ano=ano)
                for ano in range(item["ano_inicial"], ano_final + 1)
            ]
        else:
            arquivos.append(Arquivo(tabela, url, coluna_ano=item["coluna_ano"]))
    return arquivos


def primeiro_ano(caminho: Path = ARQUIVOS_TOML) -> int:
    """Primeiro ano da vigilância da água (``ano_inicial``), início das outras séries."""
    return min(a.ano for a in carregar_arquivos(caminho) if a.ano is not None)

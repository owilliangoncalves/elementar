"""Leitura do arquivos.toml: quais arquivos baixar e como dividi-los por ano."""

import tomllib
from dataclasses import dataclass
from datetime import date
from pathlib import Path

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


def carregar_arquivos(
    caminho: Path = ARQUIVOS_TOML, ano_final: int | None = None
) -> list[Arquivo]:
    with caminho.open("rb") as f:
        config = tomllib.load(f)
    ano_final = ano_final or date.today().year

    arquivos = []
    for fonte, secao in config.items():
        for item in secao.get("arquivos", []):
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

"""Manifesto: registra a versão (ETag) de cada arquivo já convertido."""

import json
from pathlib import Path


def ler(caminho: Path) -> dict[str, dict]:
    if not caminho.exists():
        return {}
    return json.loads(caminho.read_text(encoding="utf-8"))


def gravar(caminho: Path, manifesto: dict[str, dict]) -> None:
    # Escreve em um temporário e renomeia, para não corromper o manifesto.
    temporario = caminho.with_name(caminho.name + ".tmp")
    temporario.write_text(
        json.dumps(manifesto, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporario.rename(caminho)

"""Formato dos arquivos brutos: uma página da API por arquivo NDJSON comprimido.

É o contrato entre a coleta (que escreve) e a carga/verificação (que leem).
"""

import gzip
import json
from pathlib import Path

PADRAO = "*.ndjson.gz"


def arquivo_pagina(pasta: Path, pagina: int) -> Path:
    return pasta / f"{pagina:06d}.ndjson.gz"


def listar(pasta: Path) -> list[Path]:
    return sorted(pasta.glob(PADRAO))


def salvar_pagina(arquivo: Path, registros: list[dict]) -> None:
    # Escreve em um temporário e renomeia, para não deixar página pela metade.
    temporario = arquivo.with_name(arquivo.name + ".tmp")
    with gzip.open(temporario, "wt", encoding="utf-8") as f:
        for registro in registros:
            f.write(json.dumps(registro, ensure_ascii=False) + "\n")
    temporario.rename(arquivo)


def contar_linhas(arquivo: Path) -> int:
    with gzip.open(arquivo, "rt", encoding="utf-8") as f:
        return sum(1 for _ in f)

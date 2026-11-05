"""Impede duas atualizações simultâneas da mesma pasta de Parquet."""

import fcntl
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def travar(raiz: Path) -> Iterator[None]:
    # flock é liberado pelo sistema se o processo morrer, sem trava órfã.
    raiz.mkdir(parents=True, exist_ok=True)
    with (raiz / ".lock").open("w") as trava:
        try:
            fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit("Outra atualização já está em andamento")
        yield

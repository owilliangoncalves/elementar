"""Meses e arquivos mensais do coletor de qualidade do ar."""

from datetime import date, datetime, timedelta
from pathlib import Path


def mes(texto: str) -> date:
    return datetime.strptime(texto, "%Y-%m").date()


def meses(inicio: date, fim: date) -> list[date]:
    lista, atual = [], inicio.replace(day=1)
    while atual <= fim:
        lista.append(atual)
        atual = (atual + timedelta(days=32)).replace(day=1)
    return lista


def ultimo_dia(primeiro: date) -> date:
    return (primeiro + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def arquivo_mes(pasta_tabela: Path, primeiro: date) -> Path:
    return (
        pasta_tabela / f"ano={primeiro.year}" / f"mes={primeiro.month:02d}"
    ) / "dados.parquet"


def atualizado(registro: dict | None, arquivo: Path, origem: str, ate: date) -> bool:
    """O mês está em dia se o Parquet existe e veio da mesma origem até ``ate``."""
    return (
        bool(registro)
        and arquivo.exists()
        and registro.get("origem") == origem
        and registro.get("ate") == ate.isoformat()
    )

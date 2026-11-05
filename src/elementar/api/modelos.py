"""Formatos das respostas da API (aparecem na documentação em /docs)."""

from datetime import date
from typing import Any

from pydantic import BaseModel


class Estado(BaseModel):
    uf: str
    regiao: str | None
    municipios: int


class MunicipioResumo(BaseModel):
    codigo_ibge: str
    municipio: str
    uf: str


class MunicipioDaUf(BaseModel):
    codigo_ibge: str
    municipio: str
    vigilancia_analises: int | None
    controle_fora_do_padrao_registros: int | None


class AnoVigilancia(BaseModel):
    ano: int
    analises: int
    por_parametro: dict[str, int]


class Vigilancia(BaseModel):
    ultima_coleta: date | None
    por_ano: list[AnoVigilancia]


class AnoControle(BaseModel):
    ano: int
    registros: int
    por_parametro: dict[str, int]


class Controle(BaseModel):
    por_ano: list[AnoControle]


class Municipio(BaseModel):
    """Ausência de dados de uma fonte vem como null, nunca como zero."""

    codigo_ibge: str
    municipio: str
    uf: str
    regiao: str | None
    vigilancia: Vigilancia | None
    controle_fora_do_padrao: Controle | None


class Pagina(BaseModel):
    limite: int
    deslocamento: int
    itens: list[dict[str, Any]]

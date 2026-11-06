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


class MunicipioDoIndice(MunicipioDaUf):
    uf: str
    regiao: str | None


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


class Presenca(BaseModel):
    presente: int
    ausente: int


class Numerico(BaseModel):
    """Resultados que são números. O histograma vai de ``de`` a ``ate``
    (percentil 99) em faixas iguais; ``acima`` conta o que passou disso."""

    valores: int
    de: float
    ate: float
    maximo: float
    q1: float
    mediana: float
    q3: float
    acima: int
    histograma: list[int]


class ParametroVigilancia(BaseModel):
    parametro: str
    analises: int
    por_mes: list[int]
    presentes_por_mes: list[int]
    motivos: dict[str, int]
    abaixo_do_limite: int
    presenca: Presenca | None
    numerico: Numerico | None


class Area(BaseModel):
    area: str
    registros: int


class ParametroControle(BaseModel):
    parametro: str
    registros: int
    zonas: dict[str, int]
    pontos: dict[str, int]
    areas: list[Area]
    outras_areas: int


class Extremo(BaseModel):
    """O dia mais recente com o valor; ``dias`` conta os empates."""

    valor: float
    data: date
    dias: int


class MesAr(BaseModel):
    mes: str  # AAAA-MM
    media: float
    minimo: float
    maximo: float
    dias: int
    origem: str  # reanalise ou previsao


class PoluenteAr(BaseModel):
    poluente: str
    unidade: str
    maximo: Extremo
    minimo: Extremo
    por_mes: list[MesAr]


class QualidadeDoAr(BaseModel):
    """Estimativas diárias do SISAM. No DF, as Regiões Administrativas recebem o
    valor do Distrito Federal inteiro (``distrito_federal``)."""

    distrito_federal: bool
    poluentes: list[PoluenteAr]

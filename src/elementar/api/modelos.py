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


class MesFocos(BaseModel):
    mes: str  # AAAA-MM
    focos: int


class DiaFocos(BaseModel):
    data: date
    focos: int


class BiomaFocos(BaseModel):
    bioma: str
    focos: int


class Queimadas(BaseModel):
    """Focos do satélite de referência do INPE. ``por_mes`` só traz meses com
    focos; os demais meses de ``inicio`` a ``fim`` tiveram zero. No DF, as
    Regiões Administrativas recebem o Distrito Federal inteiro."""

    distrito_federal: bool
    inicio: str  # AAAA-MM
    fim: str  # AAAA-MM, parcial até ``atualizado_ate``
    atualizado_ate: date
    total: int
    pior_mes: MesFocos | None
    pior_dia: DiaFocos | None
    biomas: list[BiomaFocos]
    por_mes: list[MesFocos]


class AnoDesmatamento(BaseModel):
    ano: int
    alertas: int
    area_ha: float


class FaixaDeTamanho(BaseModel):
    """Alertas com área inteira de ``de`` (inclusive) até ``ate`` hectares."""

    de: float
    ate: float | None
    alertas: int
    area_ha: float


class Cruzamento(BaseModel):
    """Alertas que cruzam a categoria; um alerta pode cruzar várias."""

    cruzamento: str
    alertas: int
    area_ha: float


class MaiorAlerta(BaseModel):
    alerta: int  # código na plataforma MapBiomas Alerta
    data: date
    area_ha: float  # o alerta inteiro
    area_municipio: float


class BiomaArea(BaseModel):
    bioma: str
    area_ha: float


class AguaDaUf(BaseModel):
    analises: int  # vigilância, todos os anos
    registros_fora_do_padrao: int  # controle mensal, todos os anos
    municipios_com_analises: int
    municipios_com_registros: int
    de: int | None  # primeiro ano da vigilância
    ate: int | None


class ArDaUf(BaseModel):
    """O maior valor diário do poluente entre os municípios da UF."""

    poluente: str
    unidade: str
    valor: float
    data: date
    codigo_ibge: str
    municipio: str


class FogoDaUf(BaseModel):
    focos: int
    inicio: str  # AAAA-MM
    fim: str  # AAAA-MM
    pior_mes: MesFocos | None


class TerraDaUf(BaseModel):
    """Área dos alertas dentro dos municípios da UF, em hectares."""

    alertas: int
    area_ha: float
    inicio: str  # AAAA-MM
    fim: str  # AAAA-MM


class ResumoDaUf(BaseModel):
    """Um bloco por elemento; null quando a fonte não foi carregada."""

    uf: str
    agua: AguaDaUf
    ar: ArDaUf | None
    fogo: FogoDaUf | None
    terra: TerraDaUf | None


class Desmatamento(BaseModel):
    """Alertas validados do MapBiomas Alerta, por data de detecção. As áreas são
    a parte de cada alerta dentro do município; no DF, o Distrito Federal
    inteiro. ``por_ano`` traz todos os anos de ``inicio`` a ``fim``."""

    distrito_federal: bool
    inicio: str  # AAAA-MM
    fim: str  # AAAA-MM
    atualizado_em: date | None  # geração do relatório pelo MapBiomas
    alertas: int
    area_ha: float
    maior: MaiorAlerta | None
    por_ano: list[AnoDesmatamento]
    tamanhos: list[FaixaDeTamanho]
    cruzamentos: list[Cruzamento]
    biomas: list[BiomaArea]

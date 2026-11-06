"""Lista de municípios do IBGE para achar o código pelo nome e pela UF.

Usada pelas fontes que só trazem o nome do município (focos anuais do INPE,
alertas do MapBiomas). Os nomes são comparados sem acentos, espaços nem
pontuação; ``APELIDOS`` cobre grafias antigas que essas fontes ainda usam.
"""

import logging
from pathlib import Path

import duckdb
import httpx

from elementar.arquivos.conversao import literal

URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"

# Grafias das fontes que diferem do IBGE (nome na fonte, código IBGE).
APELIDOS = [
    ("AÇU", 2400208),  # Assú (RN)
    ("ARÊS", 2401206),  # Arez (RN)
    ("AUGUSTO SEVERO", 2401305),  # Campo Grande (RN)
    ("BARÃO DE MONTE ALTO", 3105509),  # Barão do Monte Alto (MG)
    ("DONA EUSÉBIA", 3122900),  # Dona Euzébia (MG)
    ("FORTALEZA DO TABOCÃO", 1708254),  # Tabocão (TO)
    ("GRACHO CARDOSO", 2802601),  # Graccho Cardoso (SE)
    ("SANTO ANTÔNIO DO LEVERGER", 5107800),  # Santo Antônio de Leverger (MT)
    ("SÃO LUIZ", 1400605),  # São Luiz do Anauá (RR)
    ("SÃO THOMÉ DAS LETRAS", 3165206),  # São Tomé das Letras (MG)
]

log = logging.getLogger(__name__)


def municipios_ibge(cliente: httpx.Client, destino: Path) -> Path:
    """Lista de municípios do IBGE, baixada uma vez e guardada em ``destino``."""
    if not destino.exists():
        log.info("baixando a lista de municípios do IBGE para %s", destino)
        resposta = cliente.get(URL)
        resposta.raise_for_status()
        destino.parent.mkdir(parents=True, exist_ok=True)
        temporario = destino.with_name(destino.name + ".tmp")
        temporario.write_bytes(resposta.content)
        temporario.rename(destino)
    return destino


def preparar_nomes(con: duckdb.DuckDBPyConnection, ibge: Path) -> None:
    """Macro ``norma`` e tabelas ``municipios``, ``ufs`` e ``apelidos`` (com a UF)."""
    con.execute(
        "CREATE MACRO norma(s) AS "
        "regexp_replace(upper(strip_accents(trim(s))), '[^A-Z0-9]', '', 'g')"
    )
    json_ = f"read_json({literal(ibge)})"
    con.execute(
        'CREATE TABLE municipios AS SELECT CAST("UF-id" AS INTEGER) AS uf, '
        'norma("municipio-nome") AS nome, '
        f'CAST("municipio-id" AS INTEGER) AS codigo FROM {json_}'
    )
    con.execute(
        'CREATE TABLE ufs AS SELECT DISTINCT CAST("UF-id" AS INTEGER) AS codigo, '
        f'norma("UF-nome") AS nome FROM {json_}'
    )
    con.execute("CREATE TABLE apelidos (nome VARCHAR, codigo INTEGER)")
    con.executemany("INSERT INTO apelidos VALUES (norma(?), ?)", APELIDOS)
    con.execute("ALTER TABLE apelidos ADD COLUMN uf INTEGER")
    con.execute("UPDATE apelidos SET uf = codigo // 100000")

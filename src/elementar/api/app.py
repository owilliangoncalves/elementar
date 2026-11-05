"""API de qualidade da água por município (FastAPI).

Documentação interativa em ``/docs``. Os dados vêm da camada servida gerada
por ``elementar-arquivos``; reinicie a API depois de atualizar o pipeline.
"""

import argparse
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as Caminho
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from elementar.api.base import Base
from elementar.api.modelos import (
    Estado,
    Municipio,
    MunicipioDaUf,
    MunicipioDoIndice,
    MunicipioResumo,
    Pagina,
)
from elementar.config import DADOS_PADRAO, configurar_log

log = logging.getLogger(__name__)

WEB = Path(__file__).parent.parent / "web"

CodigoIbge = Annotated[
    str, Caminho(pattern=r"^\d{6}$", description="Código IBGE com 6 dígitos")
]
Uf = Annotated[str, Caminho(pattern=r"^[A-Za-z]{2}$", description="Sigla da UF")]


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
    dados = Path(os.environ.get("ELEMENTAR_DADOS", DADOS_PADRAO))
    app.state.base = Base(dados)
    yield
    app.state.base.con.close()


app = FastAPI(
    title="Elementar: qualidade da água",
    description="Dados do SISAGUA (OpenDataSUS) por município, sem tratamento.",
    lifespan=ciclo_de_vida,
)
# Dados públicos e só leitura: qualquer site pode consumir.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def base(request: Request) -> Base:
    return request.app.state.base


@app.get("/saude")
def saude() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/atualizacao")
def atualizacao(request: Request) -> dict[str, dict]:
    """Quando cada fonte foi modificada no OpenDataSUS e baixada pelo pipeline."""
    return base(request).atualizacao()


@app.get("/estados")
def estados(request: Request) -> list[Estado]:
    return base(request).estados()


@app.get("/estados/{uf}/municipios")
def municipios_da_uf(request: Request, uf: Uf) -> list[MunicipioDaUf]:
    resultado = base(request).municipios_com_totais(uf)
    if not resultado:
        raise HTTPException(404, f"UF sem dados: {uf}")
    return resultado


@app.get("/municipios")
def buscar(
    request: Request,
    busca: Annotated[str | None, Query(max_length=100)] = None,
    uf: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2}$")] = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[MunicipioResumo]:
    """Busca por nome, sem diferenciar acentos nem maiúsculas."""
    return base(request).buscar(busca, uf, limite)


# Declarada antes de /municipios/{codigo} para não ser capturada por ela.
@app.get("/municipios/indice")
def indice(request: Request) -> list[MunicipioDoIndice]:
    """Todos os municípios com os totais de cada fonte, para o índice de A a Z."""
    return base(request).municipios_com_totais()


@app.get("/municipios/{codigo}")
def municipio(request: Request, codigo: CodigoIbge) -> Municipio:
    resultado = base(request).municipio(codigo)
    if resultado is None:
        raise HTTPException(404, f"Município não encontrado: {codigo}")
    return resultado


@app.get("/municipios/{codigo}/{tabela}")
def linhas(
    request: Request,
    codigo: CodigoIbge,
    tabela: Literal["vigilancia", "controle"],
    ano: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    parametro: Annotated[str | None, Query(max_length=100)] = None,
    limite: Annotated[int, Query(ge=1, le=500)] = 100,
    deslocamento: Annotated[int, Query(ge=0)] = 0,
) -> Pagina:
    """Registros do município. Na vigilância, informar ``ano`` deixa bem mais rápido."""
    itens = base(request).linhas(tabela, codigo, ano, parametro, limite, deslocamento)
    return Pagina(limite=limite, deslocamento=deslocamento, itens=itens)


# Front compilado (frontend/, ``npm run build``) na raiz. Montado por último para não encobrir as rotas da API.
if WEB.is_dir():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--porta", type=int, default=8000)
    args = parser.parse_args()
    configurar_log()

    os.environ["ELEMENTAR_DADOS"] = str(args.dados)
    uvicorn.run(app, host=args.host, port=args.porta)


if __name__ == "__main__":
    main()

"""Verifica se as tabelas do DuckDB gerado pela coleta estão como esperado.

Para cada URL do endpoints.toml confere se a tabela existe, se as colunas
batem com ``campos``, se o total de linhas bate com os arquivos brutos e se
os valores de algumas colunas conhecidas têm o formato esperado.
Sai com código 1 se alguma verificação falhar.
"""

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

import duckdb

from elementar import bruto
from elementar.config import (
    DADOS_PADRAO,
    Recurso,
    caminho_banco,
    carregar_recursos,
    raiz_bruta,
)

UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
    "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
}  # fmt: skip


@dataclass
class Relatorio:
    falhas: int = 0
    avisos: int = 0
    linhas: list[str] = field(default_factory=list)

    def ok(self, mensagem: str) -> None:
        self.linhas.append(f"  [OK]    {mensagem}")

    def aviso(self, mensagem: str) -> None:
        self.avisos += 1
        self.linhas.append(f"  [AVISO] {mensagem}")

    def falha(self, mensagem: str) -> None:
        self.falhas += 1
        self.linhas.append(f"  [FALHA] {mensagem}")


def colunas_da_tabela(con: duckdb.DuckDBPyConnection, tabela: str) -> list[str]:
    linhas = con.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = ? ORDER BY ordinal_position",
        [tabela],
    ).fetchall()
    return [nome for (nome,) in linhas]


def contar(con: duckdb.DuckDBPyConnection, sql: str) -> int:
    ((total,),) = con.execute(sql).fetchall()
    return total


def verificar_colunas(rel: Relatorio, recurso: Recurso, colunas: list[str]) -> None:
    faltando = [c for c in recurso.campos if c not in colunas]
    sobrando = [c for c in colunas if c not in recurso.campos]
    if faltando or sobrando:
        rel.falha(f"colunas divergentes; faltando={faltando} sobrando={sobrando}")
    else:
        rel.ok(f"{len(colunas)} colunas conforme campos do endpoints.toml")


def verificar_total(rel: Relatorio, recurso: Recurso, total: int, raiz: Path) -> None:
    if total == 0:
        rel.falha("tabela vazia")
        return
    arquivos = bruto.listar(recurso.pasta(raiz))
    if not arquivos:
        rel.aviso(f"{total} linhas; sem arquivos brutos para comparar")
        return
    brutos = sum(bruto.contar_linhas(arquivo) for arquivo in arquivos)
    if total == brutos:
        rel.ok(f"{total} linhas, igual aos {len(arquivos)} arquivos brutos")
    else:
        rel.falha(f"{total} linhas na tabela, {brutos} nos arquivos brutos")


def verificar_nulos(
    rel: Relatorio, con: duckdb.DuckDBPyConnection, tabela: str, colunas: list[str]
) -> None:
    contagens = ", ".join(f'count("{c}")' for c in colunas)
    ((total, *preenchidos),) = con.execute(
        f"SELECT count(*), {contagens} FROM {tabela}"
    ).fetchall()
    for coluna, n in zip(colunas, preenchidos, strict=True):
        if n == 0:
            rel.aviso(f"{coluna}: todos os valores são nulos")
        elif n < total:
            rel.ok(f"{coluna}: {100 * (total - n) / total:.1f}% nulos")


def verificar_formatos(
    rel: Relatorio, con: duckdb.DuckDBPyConnection, tabela: str, colunas: list[str]
) -> None:
    for coluna in (c for c in colunas if c.startswith("data_")):
        invalidas = contar(
            con,
            f'SELECT count(*) FROM {tabela} WHERE "{coluna}" IS NOT NULL '
            f"AND try_strptime(\"{coluna}\", '%Y-%m-%d') IS NULL",
        )
        if invalidas:
            rel.falha(f"{coluna}: {invalidas} valores fora do formato AAAA-MM-DD")
        else:
            rel.ok(f"{coluna}: datas no formato AAAA-MM-DD")

    if "uf" in colunas:
        lista = ", ".join(f"'{uf}'" for uf in sorted(UFS))
        invalidas = con.execute(
            f"SELECT DISTINCT uf FROM {tabela} "
            f"WHERE uf IS NOT NULL AND uf NOT IN ({lista}) LIMIT 10"
        ).fetchall()
        if invalidas:
            rel.falha(f"uf: valores inválidos {[uf for (uf,) in invalidas]}")
        else:
            rel.ok("uf: apenas siglas válidas")


def verificar_recurso(
    con: duckdb.DuckDBPyConnection, recurso: Recurso, raiz: Path, amostra: int
) -> Relatorio:
    rel = Relatorio()
    colunas = colunas_da_tabela(con, recurso.tabela)
    if not colunas:
        rel.falha("tabela não existe")
        return rel

    verificar_colunas(rel, recurso, colunas)
    total = contar(con, f"SELECT count(*) FROM {recurso.tabela}")
    verificar_total(rel, recurso, total, raiz)
    if total:
        verificar_nulos(rel, con, recurso.tabela, colunas)
        verificar_formatos(rel, con, recurso.tabela, colunas)
        if amostra:
            con.sql(f"SELECT * FROM {recurso.tabela} LIMIT {amostra}").show()
    return rel


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--amostra",
        type=int,
        default=5,
        help="linhas de exemplo por tabela (0 desliga)",
    )
    args = parser.parse_args()

    banco = caminho_banco(args.dados)
    if not banco.exists():
        sys.exit(f"Banco não encontrado: {banco}")

    falhas = avisos = 0
    with duckdb.connect(banco, read_only=True) as con:
        for recurso in carregar_recursos():
            print(f"\n== {recurso.tabela} ({recurso.nome})")
            rel = verificar_recurso(con, recurso, raiz_bruta(args.dados), args.amostra)
            print("\n".join(rel.linhas))
            falhas += rel.falhas
            avisos += rel.avisos

    print(f"\nResumo: {falhas} falha(s), {avisos} aviso(s)")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()

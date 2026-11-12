"""Baixa todos os dados: água, ar, queimadas e desmatamento, nesta ordem.

Cada etapa roda em um processo próprio, com o mesmo comando que roda sozinha.
Uma etapa que falha não interrompe as seguintes, e as falhas são listadas no
fim. Os manifestos de cada etapa evitam baixar de novo o que já está gravado.
"""

import argparse
import logging
import subprocess
import sys
from pathlib import Path

from elementar.config import DADOS_PADRAO, configurar_log

log = logging.getLogger(__name__)

# A camada servida da água é gerada pelo próprio elementar.arquivos.atualizar.
ETAPAS = {
    "agua": "elementar.arquivos.atualizar",
    "ar": "elementar.ar.sisam",
    "queimadas": "elementar.queimadas.focos",
    "desmatamento": "elementar.desmatamento.alertas",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dados", type=Path, default=DADOS_PADRAO, help="pasta de dados (padrão: data)"
    )
    parser.add_argument(
        "--etapa",
        action="append",
        choices=ETAPAS,
        help="roda só esta etapa (pode repetir)",
    )
    parser.add_argument(
        "--forcar", action="store_true", help="ignora os manifestos e baixa tudo"
    )
    args = parser.parse_args()
    configurar_log()

    opcoes = ["--dados", str(args.dados)]
    if args.forcar:
        opcoes.append("--forcar")

    falhas = []
    for nome, modulo in ETAPAS.items():
        if args.etapa and nome not in args.etapa:
            continue
        log.info("%s: início", nome)
        resultado = subprocess.run([sys.executable, "-m", modulo, *opcoes], check=False)
        if resultado.returncode:
            log.error("%s: falha (código %d)", nome, resultado.returncode)
            falhas.append(nome)
        else:
            log.info("%s: concluída", nome)

    if falhas:
        sys.exit(f"Dados incompletos: {', '.join(falhas)}")


if __name__ == "__main__":
    main()

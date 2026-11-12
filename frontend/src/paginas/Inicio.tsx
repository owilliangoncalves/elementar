import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { IndiceAZ } from '../componentes/IndiceAZ'
import { MapaBrasil } from '../componentes/MapaBrasil'
import { PainelRegioes } from '../componentes/PainelRegioes'
import { Estatisticas, Faixa, Recorte, Secao } from '../componentes/ui'
import type { ChaveRegiao } from '../lib/lugares'

// Os quatro elementos do projeto e de onde vêm os dados de cada um.
const ELEMENTOS = [
  { nome: 'Terra', fonte: 'MapBiomas Alerta' },
  { nome: 'Ar', fonte: 'SISAM/INPE' },
  { nome: 'Água', fonte: 'SISAGUA' },
  { nome: 'Fogo', fonte: 'INPE' },
]

export function Inicio() {
  const [regiao, setRegiao] = useState<ChaveRegiao | null>(null)
  const navegar = useNavigate()

  useEffect(() => {
    document.title = 'Elementar'
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setRegiao(null)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])


  return (
    <>
      <Faixa interno="grid gap-12 py-12 md:py-16 lg:grid-cols-[5fr_7fr] lg:items-center">
        <div>
          <h1 className="manchete text-6xl sm:text-7xl xl:text-8xl">
            <span className="mb-4 block text-3xl text-texto-2 sm:text-4xl">Entenda como</span>
            elementos
            <br />
            da natureza
            <br />
            <Recorte>impactam</Recorte>
            <br />
            <Recorte marca>sua vida.</Recorte>
          </h1>
          <p className="papel mt-8 max-w-md text-[15px] leading-relaxed">
            Dados públicos reunidos cidade a cidade.
          </p>
        </div>

        <figure className="filme">
          <span className="legenda-filme absolute top-0 left-0 rotate-180 whitespace-nowrap opacity-70 [writing-mode:vertical-rl]">
            IBGE · malha das UFs · 2022
          </span>
          <MapaBrasil
            regiao={regiao}
            onRegiao={setRegiao}
            onUf={(uf) => void navegar({ to: '/uf/$uf', params: { uf } })}
          />
          {regiao && (
            <button type="button" onClick={() => setRegiao(null)} className="legenda-filme mt-3 opacity-70 hover:opacity-100">
              ← Voltar ao Brasil
            </button>
          )}
        </figure>
      </Faixa>

      <Faixa tom="marca" interno="py-12 md:py-14">
        <Estatisticas
          itens={ELEMENTOS.map((e) => ({ valor: <span className="uppercase">{e.nome}</span>, rotulo: e.fonte }))}
        />
      </Faixa>

      <Secao
        tom="tinta"
        rasgada
        titulo={
          <>
            Cinco regiões,
            <br />
            <span className="text-sul">27 estados.</span>
          </>
        }
        descricao=""
      >
        <PainelRegioes regiao={regiao} onRegiao={setRegiao} />
      </Secao>

      <Secao
        titulo={
          <>
            Municípios <Recorte marca>de A a Z.</Recorte>
          </>
        }
        classeDescricao="hidden md:block"
        descricao=""
      >
        <IndiceAZ regiao={regiao} onRegiao={setRegiao} />
      </Secao>
    </>
  )
}

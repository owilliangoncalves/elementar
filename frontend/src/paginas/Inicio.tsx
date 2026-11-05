import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { IndiceAZ } from '../componentes/IndiceAZ'
import { MapaBrasil } from '../componentes/MapaBrasil'
import { PainelRegioes } from '../componentes/PainelRegioes'
import { Secao } from '../componentes/ui'
import { type ChaveRegiao, REGIOES } from '../lib/lugares'

export function Inicio() {
  const [regiao, setRegiao] = useState<ChaveRegiao | null>(null)
  const navegar = useNavigate()

  useEffect(() => {
    document.title = 'Elementar · Qualidade da água'
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setRegiao(null)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const nomeRegiao = REGIOES.find((r) => r.chave === regiao)?.nome

  return (
    <>
      <div className="grid gap-8 py-8 lg:grid-cols-[1fr_260px]">
        <div>
          <nav className="mb-4 flex items-center gap-2 text-sm font-bold">
            <button type="button" onClick={() => setRegiao(null)} className={regiao ? 'text-texto-2 hover:text-texto' : ''}>
              Brasil
            </button>
            {nomeRegiao && (
              <>
                <span className="text-texto-3">/</span>
                {nomeRegiao}
              </>
            )}
          </nav>
          <MapaBrasil
            regiao={regiao}
            onRegiao={setRegiao}
            onUf={(uf) => void navegar({ to: '/uf/$uf', params: { uf } })}
          />
        </div>
        <PainelRegioes regiao={regiao} onRegiao={setRegiao} />
      </div>

      <Secao
        titulo="Municípios de A a Z"
        classeDescricao="hidden md:block"
        descricao="Todos os municípios com dados de qualidade da água. Toque no mapa para filtrar pela região, ou digite o nome."
      >
        <IndiceAZ regiao={regiao} onRegiao={setRegiao} />
      </Secao>
    </>
  )
}

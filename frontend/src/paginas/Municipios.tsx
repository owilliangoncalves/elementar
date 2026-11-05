import { useEffect, useState } from 'react'
import { IndiceAZ } from '../componentes/IndiceAZ'
import type { ChaveRegiao } from '../lib/lugares'

export function Municipios() {
  const [regiao, setRegiao] = useState<ChaveRegiao | null>(null)

  useEffect(() => {
    document.title = 'Municípios de A a Z · Elementar'
  }, [])

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold">Municípios, de A a Z</h1>
      <p className="mt-2 mb-6 max-w-2xl text-texto-2">
        Todos os municípios com dados de qualidade da água no SISAGUA. Filtre por região, estado ou nome.
      </p>
      <IndiceAZ regiao={regiao} onRegiao={setRegiao} />
    </div>
  )
}

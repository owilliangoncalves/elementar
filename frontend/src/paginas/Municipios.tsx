import { useEffect, useState } from 'react'
import { IndiceAZ } from '../componentes/IndiceAZ'
import { Faixa, Recorte } from '../componentes/ui'
import type { ChaveRegiao } from '../lib/lugares'

export function Municipios() {
  const [regiao, setRegiao] = useState<ChaveRegiao | null>(null)

  useEffect(() => {
    document.title = 'Municípios'
  }, [])

  return (
    <>
      <Faixa interno="py-12 md:py-16">
        <h1 className="manchete text-6xl md:text-8xl">
          Todos os municípios,
          <br />
          <Recorte marca>Municípios.</Recorte>
        </h1>
      </Faixa>
      <Faixa tom="papel-2" interno="py-12 md:py-16">
        <IndiceAZ regiao={regiao} onRegiao={setRegiao} />
      </Faixa>
    </>
  )
}

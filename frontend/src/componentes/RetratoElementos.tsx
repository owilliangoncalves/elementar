import type { ReactNode } from 'react'

// O que uma coluna mostra: o número principal, uma frase dizendo o que ele é e
// linhas de contexto (onde, quando). Linhas falsas são puladas.
export interface Coluna {
  destaque: ReactNode
  legenda: string
  contexto: (string | false | null | undefined)[]
}

export interface Elemento {
  nome: string
  cor: string
  fonte: string
  // null: a fonte não tem dados para este lugar.
  coluna: Coluna | null
  carregando?: boolean
  erro?: boolean
}

export function ComUnidade({ valor, unidade }: { valor: string; unidade: string }) {
  return (
    <>
      {valor}
      <span className="ml-1.5 text-2xl text-texto-2">{unidade}</span>
    </>
  )
}

// Água, ar, terra e fogo lado a lado, cada um com o fio na cor que o dado usa
// nos gráficos. Usado no resumo do estado e no do município.
export function RetratoElementos({ elementos }: { elementos: Elemento[] }) {
  return (
    <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4 xl:gap-x-0 xl:colunas-fio">
      {elementos.map((e) => (
        <section
          key={e.nome}
          className="flex flex-col border-t-4 pt-5 xl:px-8 xl:first:pl-0 xl:last:pr-0"
          style={{ borderColor: e.cor }}
        >
          <h3 className="manchete text-3xl">{e.nome}</h3>
          {e.coluna ? (
            <>
              <p className="mt-4 font-display text-5xl leading-none whitespace-nowrap lg:text-6xl">{e.coluna.destaque}</p>
              <p className="maquina mt-3 text-texto">{e.coluna.legenda}</p>
              <ul className="maquina mt-3 space-y-1.5 text-sm text-texto-2">
                {e.coluna.contexto.filter(Boolean).map((linha) => (
                  <li key={linha as string}>{linha}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="maquina mt-4 text-texto-3">
              {e.carregando ? 'Carregando…' : e.erro ? 'Não foi possível carregar.' : 'Sem dados para este lugar.'}
            </p>
          )}
          <p className="mt-auto pt-5 text-xs text-texto-3">Fonte: {e.fonte}</p>
        </section>
      ))}
    </div>
  )
}

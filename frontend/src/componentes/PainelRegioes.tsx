import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { consultas } from '../lib/api'
import { fmt, semAcento } from '../lib/formato'
import { type ChaveRegiao, NOMES_UF, REGIOES, nomeUf, regiaoDaUf } from '../lib/lugares'
import { SetaCanto, cn } from './ui'

// As cinco regiões lado a lado, separadas por fios; a escolhida abre os estados.
export function PainelRegioes({
  regiao,
  onRegiao,
}: {
  regiao: ChaveRegiao | null
  onRegiao: (regiao: ChaveRegiao | null) => void
}) {
  const [filtro, setFiltro] = useState('')
  const navegar = useNavigate()
  const { data: estados } = useQuery(consultas.estados())

  const municipiosPorUf = useMemo(() => new Map(estados?.map((e) => [e.uf, e.municipios])), [estados])
  const encontrados = useMemo(() => {
    const termo = semAcento(filtro.trim())
    if (!termo) return []
    return Object.keys(NOMES_UF).filter((uf) => semAcento(`${uf} ${NOMES_UF[uf]}`).includes(termo))
  }, [filtro])

  const abrir = (uf: string) => void navegar({ to: '/uf/$uf', params: { uf } })
  const escolhida = REGIOES.find((r) => r.chave === regiao)

  return (
    <div>
      <div className="relative mb-10 max-w-md">
        <label className="flex h-12 items-center gap-3 border-2 border-texto px-4 focus-within:border-sul">
          <Search className="size-4 text-texto-2" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && encontrados[0] && abrir(encontrados[0])}
            placeholder="Busque pelo seu Estado"
            aria-label="Buscar estado"
            className="maquina h-full flex-1 bg-transparent outline-none placeholder:text-texto-3"
          />
        </label>
        {filtro.trim() && (
          <ul className="absolute inset-x-0 top-full z-20 border-2 border-t-0 border-texto bg-fundo">
            {encontrados.map((uf) => (
              <li key={uf}>
                <button
                  type="button"
                  onClick={() => abrir(uf)}
                  className="flex w-full items-center gap-3 border-b border-linha px-4 py-3 text-left last:border-b-0 hover:bg-superficie-2"
                >
                  <span className="w-8 font-mono text-sm font-bold" style={{ color: regiaoDaUf(uf).cor }}>
                    {uf}
                  </span>
                  <span className="font-semibold">{nomeUf(uf)}</span>
                </button>
              </li>
            ))}
            {encontrados.length === 0 && <li className="maquina px-4 py-3 text-texto-3">Nenhum estado.</li>}
          </ul>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:colunas-fio">
        {REGIOES.map((r) => {
          const ativa = regiao === r.chave
          return (
            <li key={r.chave} className="lg:px-6 lg:first:pl-0">
              <button
                type="button"
                aria-pressed={ativa}
                onClick={() => onRegiao(ativa ? null : r.chave)}
                className={cn(
                  'group block w-full border-t-4 pt-4 text-left transition',
                  regiao && !ativa && 'opacity-40 hover:opacity-100',
                )}
                style={{ borderColor: r.cor }}
              >
                <span className="block font-display text-7xl leading-none md:text-8xl" style={{ color: r.cor }}>
                  {r.ufs.length}
                </span>
                <span className="manchete mt-3 block text-3xl group-hover:underline">{r.nome}</span>
                <span className="mt-2 block font-mono text-xs leading-relaxed text-texto-2">{r.ufs.join(' · ')}</span>
                {estados && (
                  <span className="maquina mt-1 block text-sm text-texto-3">
                    {fmt(r.ufs.reduce((t, uf) => t + (municipiosPorUf.get(uf) ?? 0), 0))} municípios com dados
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {escolhida && (
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {escolhida.ufs.map((uf) => (
            <li key={uf}>
              <button
                type="button"
                onClick={() => abrir(uf)}
                className="group flex w-full items-end justify-between gap-3 border-2 border-linha p-4 text-left transition hover:border-texto"
              >
                <span>
                  <span className="block font-display text-4xl leading-none" style={{ color: escolhida.cor }}>
                    {uf}
                  </span>
                  <span className="mt-2 block text-sm font-semibold">{nomeUf(uf)}</span>
                  <span className="maquina block text-xs text-texto-3">{fmt(municipiosPorUf.get(uf))} municípios</span>
                </span>
                <SetaCanto className="opacity-0 transition group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="maquina mt-10 text-sm text-texto-3">
        A cor só mostra a região do IBGE. Não tem relação com os dados.
      </p>
    </div>
  )
}

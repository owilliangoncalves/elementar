import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { consultas } from '../lib/api'
import { fmt, semAcento } from '../lib/formato'
import { type ChaveRegiao, NOMES_UF, REGIOES, nomeUf, regiaoDaUf } from '../lib/lugares'

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
  const visiveis = regiao ? REGIOES.filter((r) => r.chave === regiao) : REGIOES

  return (
    <aside className="flex flex-col">
      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && encontrados[0] && abrir(encontrados[0])}
        placeholder="Estado"
        aria-label="Buscar estado"
        className="h-10 rounded-full border border-linha bg-superficie px-4 text-sm outline-none placeholder:text-texto-3 focus:border-texto-3"
      />
      <div className="mt-3 border-t-2 border-texto" />

      {encontrados.length > 0 || filtro.trim() ? (
        <ul className="mt-2">
          {encontrados.map((uf) => (
            <li key={uf}>
              <button
                type="button"
                onClick={() => abrir(uf)}
                className="flex w-full items-center gap-3 border-b border-linha py-3 text-left hover:text-texto-2"
              >
                <span className="w-8 font-mono text-sm font-bold" style={{ color: regiaoDaUf(uf).cor }}>
                  {uf}
                </span>
                <span className="font-semibold">{nomeUf(uf)}</span>
              </button>
            </li>
          ))}
          {encontrados.length === 0 && <li className="py-3 text-sm text-texto-3">Nenhum estado.</li>}
        </ul>
      ) : (
        <>
          <h3 className="mt-5 mb-1 font-bold">{regiao ? 'Estados da região' : 'Escolha uma região'}</h3>
          <ul>
            {visiveis.map((r) => (
              <li key={r.chave} className="border-b border-linha last:border-b-0">
                <button
                  type="button"
                  onClick={() => onRegiao(regiao === r.chave ? null : r.chave)}
                  className="group flex w-full items-start gap-4 py-3 text-left"
                >
                  <span className="w-12 text-center font-display text-5xl leading-none font-medium" style={{ color: r.cor }}>
                    {r.ufs.length}
                  </span>
                  <span>
                    <span className="block text-lg font-bold group-hover:underline">{r.nome}</span>
                    <span className="block font-mono text-xs leading-relaxed text-texto-2">{r.ufs.join(' · ')}</span>
                    {estados && (
                      <span className="block text-xs text-texto-3">
                        {fmt(r.ufs.reduce((t, uf) => t + (municipiosPorUf.get(uf) ?? 0), 0))} municípios com dados
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {regiao && (
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {visiveis[0].ufs.map((uf) => (
                <li key={uf}>
                  <button
                    type="button"
                    onClick={() => abrir(uf)}
                    className="w-full rounded-xl border border-linha p-3 text-left transition hover:border-texto-3"
                  >
                    <span className="block font-mono text-sm font-bold" style={{ color: visiveis[0].cor }}>
                      {uf}
                    </span>
                    <span className="block text-sm font-semibold">{nomeUf(uf)}</span>
                    <span className="block text-xs text-texto-3">{fmt(municipiosPorUf.get(uf))} municípios</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-texto-2">
            A cor só mostra a região do IBGE. Não tem relação com a qualidade da água.
          </p>
        </>
      )}
    </aside>
  )
}

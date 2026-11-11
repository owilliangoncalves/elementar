import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { ArrowRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type MunicipioDoIndice, consultas } from '../lib/api'
import { chaveNome, fmt, inicial, semAcento, tituloNome } from '../lib/formato'
import { type ChaveRegiao, REGIOES, nomeUf, regiaoDaUf } from '../lib/lugares'
import { Carregando, Falha, Pilula, Seletor } from './ui'

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
// Cartões por letra na visão de A a Z, antes do "Ver todos".
const POR_LETRA = 9

interface Item extends MunicipioDoIndice {
  nome: string
  busca: string
  letra: string
}

function Cartao({ m, contorno }: { m: Item; contorno?: string }) {
  const regiao = regiaoDaUf(m.uf)
  return (
    <Link
      to="/municipio/$codigo"
      params={{ codigo: m.codigo_ibge }}
      className="group flex flex-col items-center text-center"
    >
      <span className="relative grid size-20 place-items-center transition group-hover:scale-105">
        {contorno ? (
          <svg viewBox="0 0 100 100" aria-hidden className="size-full overflow-visible">
            <path
              d={contorno}
              style={{
                fill: `color-mix(in srgb, ${regiao.cor} 22%, transparent)`,
                stroke: regiao.cor,
                strokeWidth: 2,
                strokeLinejoin: 'round',
                vectorEffect: 'non-scaling-stroke',
              }}
            />
          </svg>
        ) : (
          <span className="size-16 border-2 border-dashed" style={{ borderColor: regiao.cor }} />
        )}
        <span className="fita absolute -bottom-1 left-1/2 -translate-x-1/2">{m.uf}</span>
      </span>
      <span className="mt-3 text-sm leading-tight font-bold group-hover:underline">{m.nome}</span>
      <span className="mt-0.5 text-xs text-texto-3">
        {nomeUf(m.uf)}
      </span>
    </Link>
  )
}

// No DF o SISAGUA usa as Regiões Administrativas, que só casam pelo nome.
const chaveContorno = (m: Item) => (m.uf === 'DF' ? `DF:${chaveNome(m.municipio)}` : m.codigo_ibge)

export function IndiceAZ({
  regiao,
  onRegiao,
}: {
  regiao: ChaveRegiao | null
  onRegiao: (regiao: ChaveRegiao | null) => void
}) {
  const { data, error, isPending } = useQuery(consultas.indice())
  const { data: contornos } = useQuery(consultas.contornos())
  const [texto, setTexto] = useState('')
  const [uf, setUf] = useState('')
  const [letra, setLetra] = useState<string | null>(null)

  const itens = useMemo<Item[]>(
    () =>
      (data ?? []).map((m) => {
        const nome = tituloNome(m.municipio)
        return { ...m, nome, busca: semAcento(nome), letra: inicial(nome) }
      }),
    [data],
  )

  const ufsDaRegiao = regiao ? REGIOES.find((r) => r.chave === regiao)!.ufs : REGIOES.flatMap((r) => r.ufs).sort()
  const ufValida = uf && ufsDaRegiao.includes(uf) ? uf : ''

  const filtrados = useMemo(() => {
    const termo = semAcento(texto.trim())
    return itens.filter(
      (m) =>
        (!termo || m.busca.includes(termo)) &&
        (!regiao || regiaoDaUf(m.uf).chave === regiao) &&
        (!ufValida || m.uf === ufValida),
    )
  }, [itens, texto, regiao, ufValida])

  const porLetra = useMemo(() => {
    const grupos = new Map<string, Item[]>()
    for (const m of filtrados) {
      if (!grupos.has(m.letra)) grupos.set(m.letra, [])
      grupos.get(m.letra)!.push(m)
    }
    return grupos
  }, [filtrados])

  // Com filtro estreito, mostra tudo; sem filtro, uma amostra por letra.
  const tudo = Boolean(texto.trim() || ufValida || letra)
  const letras = [...porLetra.keys()].filter((l) => !letra || l === letra).sort()

  return (
    <div>
      <label className="flex h-12 items-center gap-3 border-2 border-texto px-5">
        <Search className="size-4 text-texto-3" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite o nome de um município"
          className="h-full flex-1 bg-transparent outline-none placeholder:text-texto-3"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pilula ativa={!regiao} onClick={() => onRegiao(null)}>
          Todas as regiões
        </Pilula>
        {REGIOES.map((r) => (
          <Pilula key={r.chave} ativa={regiao === r.chave} onClick={() => onRegiao(r.chave)}>
            <span className="mr-2 inline-block size-2 rounded-full" style={{ background: r.cor }} />
            {r.nome}
          </Pilula>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Seletor
          rotulo="Estado"
          valor={ufValida}
          onMudar={setUf}
          opcoes={[{ valor: '', rotulo: 'Estado: todos' }, ...ufsDaRegiao.map((u) => ({ valor: u, rotulo: nomeUf(u) }))]}
        />
        <div className="text-texto-2">
          <span className="font-display text-4xl text-texto">{fmt(filtrados.length)}</span> municípios, de
          A a Z
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-0.5 md:gap-1">
        {[null, ...LETRAS].map((l) => {
          const vazia = l != null && !porLetra.has(l)
          return (
            <button
              key={l ?? 'todas'}
              type="button"
              disabled={vazia}
              onClick={() => setLetra(l)}
              className={clsx(
                'grid h-9 min-w-9 place-items-center px-2 font-display text-base font-medium whitespace-nowrap transition md:h-10 md:min-w-10 md:text-lg',
                l == null && 'px-3',
                letra === l ? 'bg-sul text-[#15171c]' : 'text-texto-2 hover:text-texto',
                vazia && 'opacity-25',
              )}
            >
              {l ?? 'A–Z'}
            </button>
          )
        })}
      </div>

      {isPending ? (
        <Carregando texto="Carregando municípios…" />
      ) : error ? (
        <Falha erro={error} />
      ) : letras.length === 0 ? (
        <div className="py-16 text-center text-texto-3">Nenhum município encontrado.</div>
      ) : (
        <div className="mt-2">
          {letras.map((l) => {
            const grupo = porLetra.get(l)!
            const mostrados = tudo ? grupo : grupo.slice(0, POR_LETRA)
            return (
              <div key={l} className="flex flex-col gap-4 border-t-2 border-texto py-6 md:flex-row md:gap-6">
                <div className="manchete shrink-0 text-7xl md:w-28 md:text-9xl">{l}</div>
                <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-3 gap-y-6">
                  {mostrados.map((m) => (
                    <Cartao key={m.codigo_ibge} m={m} contorno={contornos?.[chaveContorno(m)]} />
                  ))}
                  {grupo.length > mostrados.length && (
                    <button
                      type="button"
                      onClick={() => setLetra(l)}
                      className="group flex flex-col items-center text-center"
                    >
                      <span className="grid size-20 place-items-center border-2 border-dashed border-linha transition group-hover:border-texto-3">
                        <ArrowRight className="size-6" />
                      </span>
                      <span className="mt-2 text-sm font-bold">Ver todos</span>
                      <span className="text-xs text-texto-3">
                        {fmt(grupo.length)} com {l}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { ArrowRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type MunicipioDoIndice, consultas } from '../lib/api'
import { fmt, fmtCompacto, inicial, semAcento, tituloNome } from '../lib/formato'
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

function Cartao({ m }: { m: Item }) {
  const regiao = regiaoDaUf(m.uf)
  return (
    <Link
      to="/municipio/$codigo"
      params={{ codigo: m.codigo_ibge }}
      className="group flex flex-col items-center text-center"
    >
      <span
        className="relative grid size-20 place-items-center rounded-full border-2 transition group-hover:scale-105"
        style={{
          borderColor: regiao.cor,
          backgroundImage: `radial-gradient(${regiao.cor} 1.3px, transparent 1.6px)`,
          backgroundSize: '6px 6px',
        }}
      >
        <span className="rounded-md bg-fundo px-1.5 py-0.5 font-mono text-sm font-bold">{m.uf}</span>
      </span>
      <span className="mt-2 text-sm leading-tight font-bold group-hover:underline">{m.nome}</span>
      <span className="mt-0.5 text-xs text-texto-3">
        {nomeUf(m.uf)}
      </span>
      <span className="mt-0.5 text-[11px] font-bold tracking-wide text-texto-2 uppercase">
        {m.vigilancia_analises == null ? 'sem análises' : `${fmtCompacto(m.vigilancia_analises)} análises`}
      </span>
    </Link>
  )
}

export function IndiceAZ({
  regiao,
  onRegiao,
}: {
  regiao: ChaveRegiao | null
  onRegiao: (regiao: ChaveRegiao | null) => void
}) {
  const { data, error, isPending } = useQuery(consultas.indice())
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
      <label className="flex h-12 items-center gap-3 rounded-full border border-linha bg-superficie px-5 focus-within:border-texto-3">
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
          <span className="font-display text-3xl font-medium text-texto">{fmt(filtrados.length)}</span> municípios, de
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
                'grid h-9 min-w-9 place-items-center rounded-full px-2 font-display text-base font-medium whitespace-nowrap transition md:h-10 md:min-w-10 md:text-lg',
                l == null && 'px-3',
                letra === l ? 'bg-texto text-fundo' : 'text-texto-2 hover:text-texto',
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
              <div key={l} className="flex flex-col gap-4 border-t border-linha py-6 md:flex-row md:gap-6">
                <div className="shrink-0 font-display text-6xl leading-[0.85] font-bold md:w-24 md:text-8xl">{l}</div>
                <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-3 gap-y-6">
                  {mostrados.map((m) => (
                    <Cartao key={m.codigo_ibge} m={m} />
                  ))}
                  {grupo.length > mostrados.length && (
                    <button
                      type="button"
                      onClick={() => setLetra(l)}
                      className="group flex flex-col items-center text-center"
                    >
                      <span className="grid size-20 place-items-center rounded-full border-2 border-dashed border-linha transition group-hover:border-texto-3">
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

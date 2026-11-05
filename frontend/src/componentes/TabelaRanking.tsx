import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MunicipioComTotais } from '../lib/api'
import { fmt, semAcento, tituloNome } from '../lib/formato'
import { Barra, Pilula, cn } from './ui'

type Campo = 'vigilancia_analises' | 'controle_fora_do_padrao_registros' | 'municipio'
type Metrica = Exclude<Campo, 'municipio'>

const METRICAS: Record<Metrica, { titulo: string; unidade: string; cor: string }> = {
  vigilancia_analises: { titulo: 'Análises da vigilância', unidade: 'análises', cor: 'var(--color-vigilancia)' },
  controle_fora_do_padrao_registros: {
    titulo: 'Fora do padrão',
    unidade: 'fora do padrão',
    cor: 'var(--color-controle)',
  },
}

const ORDENS: { campo: Campo; rotulo: string }[] = [
  { campo: 'vigilancia_analises', rotulo: 'Análises' },
  { campo: 'controle_fora_do_padrao_registros', rotulo: 'Fora do padrão' },
  { campo: 'municipio', rotulo: 'Nome' },
]

const POR_VEZ = 25

// Número com barra, usado nas colunas do desktop.
function Coluna({ valor, maximo, cor, ativa }: { valor: number | null; maximo: number; cor: string; ativa: boolean }) {
  if (valor == null)
    return (
      <span className="w-14 text-right text-texto-3" title="Sem dados">
        —
      </span>
    )
  return (
    <span className="flex items-center gap-3">
      <span className={cn('w-14 shrink-0 text-right', ativa ? 'font-semibold' : 'text-texto-2')}>{fmt(valor)}</span>
      <span className="flex-1">
        <Barra fracao={valor / maximo} cor={cor} />
      </span>
    </span>
  )
}

// Número com bolinha de cor, usado nas linhas do celular.
function Medida({ valor, metrica }: { valor: number | null; metrica: Metrica }) {
  const { unidade, cor } = METRICAS[metrica]
  return (
    <span className={cn('inline-flex items-center gap-1.5', valor == null && 'text-texto-3')}>
      <span className="size-2 rounded-full" style={{ background: valor == null ? 'var(--color-linha)' : cor }} />
      {valor == null ? (
        `sem dados de ${metrica === 'vigilancia_analises' ? 'análises' : 'controle'}`
      ) : (
        <>
          <span className="font-semibold text-texto">{fmt(valor)}</span> {unidade}
        </>
      )}
    </span>
  )
}

// Ranking dos municípios da UF, ordenável e filtrável. Vira lista no celular.
export function TabelaRanking({ municipios }: { municipios: MunicipioComTotais[] }) {
  const [ordem, setOrdem] = useState<{ campo: Campo; desc: boolean }>({ campo: 'vigilancia_analises', desc: true })
  const [filtro, setFiltro] = useState('')
  const [visiveis, setVisiveis] = useState(POR_VEZ)

  const maximos = useMemo(
    () => ({
      vigilancia_analises: Math.max(1, ...municipios.map((m) => m.vigilancia_analises ?? 0)),
      controle_fora_do_padrao_registros: Math.max(1, ...municipios.map((m) => m.controle_fora_do_padrao_registros ?? 0)),
    }),
    [municipios],
  )

  const linhas = useMemo(() => {
    const busca = semAcento(filtro.trim())
    const sinal = ordem.desc ? -1 : 1
    return municipios
      .filter((m) => semAcento(m.municipio).includes(busca))
      .map((m) => ({ ...m, nome: tituloNome(m.municipio) }))
      .sort((a, b) => {
        if (ordem.campo === 'municipio') return sinal * a.nome.localeCompare(b.nome, 'pt-BR')
        const va = a[ordem.campo]
        const vb = b[ordem.campo]
        // "Sem dados" fica sempre no fim, qualquer que seja o sentido.
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1
        return sinal * (va - vb) || a.nome.localeCompare(b.nome, 'pt-BR')
      })
  }, [municipios, filtro, ordem])

  // A barra do celular acompanha a métrica da ordenação; por nome, mostra as análises.
  const destaque: Metrica = ordem.campo === 'municipio' ? 'vigilancia_analises' : ordem.campo

  function ordenar(campo: Campo) {
    setVisiveis(POR_VEZ)
    setOrdem((atual) =>
      atual.campo === campo ? { campo, desc: !atual.desc } : { campo, desc: campo !== 'municipio' },
    )
  }

  const Seta = ordem.desc ? ArrowDown : ArrowUp
  const colunas = 'sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(9rem,14rem)_minmax(9rem,14rem)_1rem] sm:gap-6'

  return (
    <div className="overflow-hidden rounded-2xl border border-linha bg-superficie">
      <div className="flex flex-col gap-3 border-b border-linha p-3 sm:flex-row sm:items-center">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-full bg-superficie-2 px-4">
          <Search className="size-4 text-texto-3" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value)
              setVisiveis(POR_VEZ)
            }}
            placeholder="Filtrar municípios"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-texto-3 sm:text-sm"
          />
        </label>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 sm:hidden" role="group" aria-label="Ordenar por">
          {ORDENS.map(({ campo, rotulo }) => (
            <Pilula
              key={campo}
              ativa={ordem.campo === campo}
              onClick={() => ordenar(campo)}
              className="inline-flex items-center gap-1.5"
            >
              {rotulo}
              {ordem.campo === campo && <Seta className="size-3.5" />}
            </Pilula>
          ))}
        </div>
      </div>

      <div className={cn('hidden border-b border-linha px-4 py-3 text-sm text-texto-3', colunas)}>
        <span />
        {(['municipio', 'vigilancia_analises', 'controle_fora_do_padrao_registros'] as const).map((campo) => (
          <button
            key={campo}
            type="button"
            onClick={() => ordenar(campo)}
            aria-label={`Ordenar por ${campo === 'municipio' ? 'nome' : METRICAS[campo].titulo.toLowerCase()}`}
            className={cn(
              'inline-flex items-center gap-1 font-semibold hover:text-texto',
              ordem.campo === campo && 'text-texto',
            )}
          >
            {campo === 'municipio' ? 'Município' : METRICAS[campo].titulo}
            {ordem.campo === campo && <Seta className="size-3.5" />}
          </button>
        ))}
      </div>

      <ol>
        {linhas.slice(0, visiveis).map((m, i) => (
          <li key={m.codigo_ibge} className="border-b border-linha last:border-b-0">
            <Link
              to="/municipio/$codigo"
              params={{ codigo: m.codigo_ibge }}
              className={cn(
                'group grid grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none',
                colunas,
              )}
            >
              <span className="font-display text-lg text-texto-3 tabular-nums">{i + 1}</span>
              <span className="truncate font-semibold group-hover:underline">{m.nome}</span>

              <span className="hidden sm:contents">
                {(['vigilancia_analises', 'controle_fora_do_padrao_registros'] as const).map((metrica) => (
                  <Coluna
                    key={metrica}
                    valor={m[metrica]}
                    maximo={maximos[metrica]}
                    cor={METRICAS[metrica].cor}
                    ativa={ordem.campo === metrica}
                  />
                ))}
              </span>

              <ChevronRight className="size-4 text-texto-3 sm:col-start-5" />

              <span className="col-span-2 col-start-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-2 sm:hidden">
                <Medida valor={m.vigilancia_analises} metrica="vigilancia_analises" />
                <Medida valor={m.controle_fora_do_padrao_registros} metrica="controle_fora_do_padrao_registros" />
              </span>
              {m[destaque] != null && (
                <span className="col-span-2 col-start-2 sm:hidden">
                  <Barra fracao={m[destaque] / maximos[destaque]} cor={METRICAS[destaque].cor} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      {linhas.length === 0 && <div className="py-10 text-center text-texto-3">Nenhum município com esse nome.</div>}

      {linhas.length > 0 && (
        <div className="flex flex-col items-center gap-3 border-t border-linha px-4 py-4 text-sm text-texto-2 sm:flex-row sm:justify-between">
          <span>
            {fmt(Math.min(visiveis, linhas.length))} de {fmt(linhas.length)} municípios
          </span>
          {visiveis < linhas.length && (
            <button
              type="button"
              onClick={() => setVisiveis((v) => v + POR_VEZ)}
              className="w-full rounded-full border border-linha px-5 py-2.5 font-semibold text-texto hover:border-texto-3 sm:w-auto"
            >
              Mostrar mais {fmt(Math.min(POR_VEZ, linhas.length - visiveis))}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

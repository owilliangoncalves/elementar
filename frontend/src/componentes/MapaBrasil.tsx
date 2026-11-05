import { geoMercator, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { useMemo, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import malha from '../dados/ufs.topo.json'
import { type ChaveRegiao, REGIOES, SIGLA_DO_CODIGO, nomeUf, regiaoDaUf } from '../lib/lugares'

const LARGURA = 640
const ALTURA = 640
// Estados pequenos demais para a sigla no tamanho normal.
const AREA_PEQUENA = 900

type Uf = Feature<Geometry, { codarea: string }> & { sigla: string }

const topologia = malha as unknown as Topology<{ BRUF: GeometryCollection<{ codarea: string }> }>
const colecao = feature(topologia, topologia.objects.BRUF) as FeatureCollection<Geometry, { codarea: string }>
const UFS: Uf[] = colecao.features.map((f) => ({ ...f, sigla: SIGLA_DO_CODIGO[f.properties.codarea] }))

const projecao = geoMercator().fitSize([LARGURA, ALTURA], colecao)
const caminho = geoPath(projecao)

const FORMAS = UFS.map((uf) => ({
  uf,
  d: caminho(uf) ?? '',
  centro: caminho.centroid(uf),
  pequena: caminho.area(uf) < AREA_PEQUENA,
  regiao: regiaoDaUf(uf.sigla),
}))

// Enquadramento (escala e deslocamento) que mostra só a região escolhida.
function enquadrar(regiao: ChaveRegiao | null) {
  if (!regiao) return { k: 1, x: 0, y: 0 }
  const caixas = FORMAS.filter((f) => f.regiao.chave === regiao).map((f) => caminho.bounds(f.uf))
  const x0 = Math.min(...caixas.map((c) => c[0][0]))
  const y0 = Math.min(...caixas.map((c) => c[0][1]))
  const x1 = Math.max(...caixas.map((c) => c[1][0]))
  const y1 = Math.max(...caixas.map((c) => c[1][1]))
  const k = Math.min(2.6, 0.88 / Math.max((x1 - x0) / LARGURA, (y1 - y0) / ALTURA))
  return { k, x: LARGURA / 2 - (k * (x0 + x1)) / 2, y: ALTURA / 2 - (k * (y0 + y1)) / 2 }
}

export function MapaBrasil({
  regiao,
  onRegiao,
  onUf,
}: {
  regiao: ChaveRegiao | null
  onRegiao: (regiao: ChaveRegiao) => void
  onUf: (uf: string) => void
}) {
  const [sobre, setSobre] = useState<string | null>(null)
  const { k, x, y } = useMemo(() => enquadrar(regiao), [regiao])
  const destaque = sobre ? FORMAS.find((f) => f.uf.sigla === sobre) : undefined

  const legenda = destaque
    ? `${nomeUf(destaque.uf.sigla)} · região ${destaque.regiao.nome}`
    : regiao
      ? 'Toque num estado para abrir'
      : 'Toque numa região ou num estado'

  return (
    <div className="relative">
      <div className="absolute top-0 left-0 z-10 rounded-full border border-linha bg-fundo/80 px-3 py-1.5 text-sm font-semibold backdrop-blur">
        {legenda}
      </div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="mx-auto block h-auto w-full max-w-[640px] touch-manipulation"
        role="img"
        aria-label="Mapa do Brasil por estado"
        onMouseLeave={() => setSobre(null)}
      >
        <defs>
          {REGIOES.map((r) => (
            <pattern key={r.chave} id={`pontos-${r.chave}`} width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="2.5" cy="2.5" r="1.45" style={{ fill: r.cor }} />
            </pattern>
          ))}
        </defs>
        <g
          style={{
            transform: `translate(${x}px, ${y}px) scale(${k})`,
            transition: 'transform 600ms cubic-bezier(.2,.7,.2,1)',
          }}
        >
          {FORMAS.map(({ uf, d, regiao: r }) => {
            const ativa = sobre === uf.sigla
            const apagada = (regiao && r.chave !== regiao) || (sobre && !ativa && r.chave !== destaque?.regiao.chave)
            return (
              <path
                key={uf.sigla}
                d={d}
                role="button"
                tabIndex={!regiao || r.chave === regiao ? 0 : -1}
                aria-label={`${nomeUf(uf.sigla)}, região ${r.nome}`}
                onMouseEnter={() => setSobre(uf.sigla)}
                onFocus={() => setSobre(uf.sigla)}
                onBlur={() => setSobre(null)}
                onClick={() => (regiao === r.chave ? onUf(uf.sigla) : regiao ? onRegiao(r.chave) : onUf(uf.sigla))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onUf(uf.sigla)
                  }
                }}
                className="cursor-pointer outline-none"
                style={{
                  fill: ativa ? r.cor : `url(#pontos-${r.chave})`,
                  stroke: ativa ? 'var(--fundo)' : 'transparent',
                  strokeWidth: 1.5,
                  vectorEffect: 'non-scaling-stroke',
                  opacity: apagada ? 0.28 : 1,
                  transition: 'opacity 200ms, fill 150ms',
                }}
              />
            )
          })}
          {FORMAS.map(({ uf, centro, pequena }) => {
            const ativa = sobre === uf.sigla
            const tamanho = (ativa ? 20 : pequena ? 9 : 12) / Math.sqrt(k)
            return (
              <text
                key={uf.sigla}
                x={centro[0]}
                y={centro[1]}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none font-mono font-semibold"
                style={{
                  fontSize: tamanho,
                  fill: 'var(--texto)',
                  paintOrder: 'stroke',
                  stroke: 'var(--fundo)',
                  strokeWidth: 3 / k,
                }}
              >
                {uf.sigla}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

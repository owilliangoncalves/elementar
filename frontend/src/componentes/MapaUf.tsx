import { useQuery } from '@tanstack/react-query'
import { geoMercator, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import 'd3-transition'
import { type ZoomTransform, zoom, zoomIdentity } from 'd3-zoom'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import { Maximize, Minus, Plus } from 'lucide-react'
import polylabel from 'polylabel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection } from 'topojson-specification'
import { type MunicipioComTotais, consultas } from '../lib/api'
import { chaveNome, fmt, tituloNome } from '../lib/formato'
import { nomeUf } from '../lib/lugares'
import { Aviso, BotaoRedondo, Carregando } from './ui'

const LARGURA = 640
const ALTURA = 560
const FONTE = 11
// Área mínima (raio do maior círculo inscrito, em pixels na tela) para rotular.
const RAIO_MINIMO = 3

export type Metrica = 'vigilancia_analises' | 'controle_fora_do_padrao_registros'

interface Propriedades {
  codarea?: string
  nome?: string
}

interface Forma {
  chave: string
  d: string
  ponto: [number, number]
  raio: number
}

interface Rotulo {
  chave: string
  nome: string
  x: number
  y: number
}

// Ponto mais "interno" do polígono (polylabel), já projetado: fica dentro mesmo
// em formas côncavas, onde o centroide cairia fora.
function pontoDoRotulo(geometria: Geometry, projetar: (p: Position) => [number, number]) {
  const poligonos =
    geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.type === 'MultiPolygon' ? geometria.coordinates : []
  let melhor = { ponto: [0, 0] as [number, number], raio: -1 }
  for (const aneis of poligonos) {
    const p = polylabel(aneis.map((anel) => anel.map(projetar)), 0.5)
    if (p.distance > melhor.raio) melhor = { ponto: [p[0], p[1]], raio: p.distance }
  }
  return melhor
}

// Escolhe os rótulos que cabem sem se sobrepor, dos maiores para os menores.
function escolherRotulos(formas: Forma[], nomes: Map<string, string>, t: ZoomTransform): Rotulo[] {
  const ocupadas: [number, number, number, number][] = []
  const rotulos: Rotulo[] = []
  for (const f of formas) {
    const nome = nomes.get(f.chave)
    if (!nome || f.raio * t.k < RAIO_MINIMO) continue
    const x = t.applyX(f.ponto[0])
    const y = t.applyY(f.ponto[1])
    const meiaLargura = (nome.length * FONTE * 0.56) / 2 + 2
    const meiaAltura = FONTE * 0.65
    const caixa: [number, number, number, number] = [x - meiaLargura, y - meiaAltura, x + meiaLargura, y + meiaAltura]
    if (caixa[0] < 0 || caixa[2] > LARGURA || caixa[1] < 0 || caixa[3] > ALTURA) continue
    if (ocupadas.some((o) => caixa[0] < o[2] && caixa[2] > o[0] && caixa[1] < o[3] && caixa[3] > o[1])) continue
    ocupadas.push(caixa)
    rotulos.push({ chave: f.chave, nome, x, y })
  }
  return rotulos
}

// Mapa dos municípios da UF, com a intensidade da cor pela contagem (escala log).
export function MapaUf({
  uf,
  municipios,
  metrica,
  cor,
  onMunicipio,
}: {
  uf: string
  municipios: MunicipioComTotais[]
  metrica: Metrica
  cor: string
  onMunicipio: (codigo: string) => void
}) {
  const { data: topologia, isPending, error } = useQuery(consultas.malhaUf(uf))
  const [sobre, setSobre] = useState<string | null>(null)
  const [transformacao, setTransformacao] = useState<ZoomTransform>(zoomIdentity)
  const svg = useRef<SVGSVGElement>(null)

  const formas = useMemo<Forma[]>(() => {
    if (!topologia) return []
    const objeto = Object.values(topologia.objects)[0] as GeometryCollection<Propriedades>
    const colecao = feature(topologia, objeto) as FeatureCollection<Geometry, Propriedades>
    const projecao = geoMercator().fitSize([LARGURA, ALTURA], colecao)
    const caminho = geoPath(projecao)
    const projetar = (p: Position) => projecao([p[0], p[1]]) ?? [0, 0]
    // A malha do IBGE usa o código com 7 dígitos; o SISAGUA, com 6 (sem o
    // verificador). A das RAs do DF só tem o nome.
    return colecao.features
      .map((f) => ({
        chave: f.properties.codarea ? f.properties.codarea.slice(0, 6) : chaveNome(f.properties.nome ?? ''),
        d: caminho(f) ?? '',
        ...pontoDoRotulo(f.geometry, projetar),
      }))
      .sort((a, b) => b.raio - a.raio)
  }, [topologia])

  const porNome = formas.some((f) => !/^\d{6}$/.test(f.chave))
  const porChave = useMemo(
    () => new Map(municipios.map((m) => [porNome ? chaveNome(m.municipio) : m.codigo_ibge, m])),
    [municipios, porNome],
  )
  const nomes = useMemo(
    () => new Map([...porChave].map(([chave, m]) => [chave, tituloNome(m.municipio)])),
    [porChave],
  )
  const rotulos = useMemo(() => escolherRotulos(formas, nomes, transformacao), [formas, nomes, transformacao])
  const maximo = Math.max(1, ...municipios.map((m) => m[metrica] ?? 0))

  // Zoom e arraste. A rolagem só dá zoom com ⌘/Ctrl (ou pinça no trackpad),
  // para não prender a rolagem da página.
  const comportamento = useMemo(
    () =>
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 16])
        .translateExtent([
          [0, 0],
          [LARGURA, ALTURA],
        ])
        .filter((e: MouseEvent | WheelEvent) =>
          e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button && !e.ctrlKey,
        )
        .on('zoom', (e: { transform: ZoomTransform }) => setTransformacao(e.transform)),
    [],
  )
  const temMapa = formas.length > 0
  useEffect(() => {
    if (!temMapa || !svg.current) return
    const alvo = select(svg.current)
    alvo.call(comportamento)
    return () => {
      alvo.on('.zoom', null)
    }
  }, [comportamento, temMapa])

  const aplicar = (acao: 'mais' | 'menos' | 'inicio') => {
    if (!svg.current) return
    const alvo = select(svg.current).transition().duration(300)
    if (acao === 'inicio') alvo.call(comportamento.transform, zoomIdentity)
    else alvo.call(comportamento.scaleBy, acao === 'mais' ? 1.8 : 1 / 1.8)
  }

  if (isPending) return <Carregando texto="Carregando mapa…" />
  if (error) return <Aviso>Mapa indisponível: {error.message}</Aviso>

  const destaque = sobre ? porChave.get(sobre) : undefined
  const intensidade = (valor: number | null | undefined) =>
    valor == null ? null : 12 + 88 * (Math.log1p(valor) / Math.log1p(maximo))

  return (
    <div>
      <div className="relative overflow-hidden">
        <div className="rotulo absolute top-0 left-0 z-10 bg-sul px-2.5 py-1 text-[#15171c]">
          {destaque
            ? `${tituloNome(destaque.municipio)} · ${destaque[metrica] == null ? 'sem dados' : fmt(destaque[metrica])}`
            : `${nomeUf(uf)}: toque numa cidade`}
        </div>
        <div className="absolute top-0 right-0 z-10 flex flex-col gap-2">
          <BotaoRedondo className="bg-fundo" onClick={() => aplicar('mais')} aria-label="Aproximar">
            <Plus className="size-4" />
          </BotaoRedondo>
          <BotaoRedondo className="bg-fundo" onClick={() => aplicar('menos')} aria-label="Afastar">
            <Minus className="size-4" />
          </BotaoRedondo>
          {transformacao.k > 1 && (
            <BotaoRedondo className="bg-fundo" onClick={() => aplicar('inicio')} aria-label="Ver a UF inteira">
              <Maximize className="size-4" />
            </BotaoRedondo>
          )}
        </div>
        <svg
          ref={svg}
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="block h-auto w-full cursor-grab select-none active:cursor-grabbing"
          role="img"
          aria-label={`Mapa dos municípios de ${nomeUf(uf)}`}
          onMouseLeave={() => setSobre(null)}
        >
          <g transform={transformacao.toString()}>
            {formas.map(({ chave, d }) => {
              const m = porChave.get(chave)
              const pct = intensidade(m?.[metrica])
              return (
                <path
                  key={chave}
                  d={d}
                  onMouseEnter={() => setSobre(chave)}
                  onClick={() => m && onMunicipio(m.codigo_ibge)}
                  className={m ? 'cursor-pointer' : undefined}
                  style={{
                    fill: pct == null ? 'var(--superficie-2)' : `color-mix(in srgb, ${cor} ${pct}%, var(--fundo))`,
                    stroke: sobre === chave ? 'var(--texto)' : 'var(--fundo)',
                    strokeWidth: sobre === chave ? 1.5 : 0.5,
                    vectorEffect: 'non-scaling-stroke',
                  }}
                />
              )
            })}
          </g>
          <g className="pointer-events-none" style={{ fontSize: FONTE, fontWeight: 500 }}>
            {rotulos.map((r) => (
              <text
                key={r.chave}
                x={r.x}
                y={r.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--texto)',
                  paintOrder: 'stroke',
                  stroke: 'var(--superficie)',
                  strokeWidth: 3,
                  strokeLinejoin: 'round',
                  opacity: sobre && sobre !== r.chave ? 0.55 : 1,
                }}
              >
                {r.nome}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <div className="legenda-filme mt-4 flex flex-wrap items-center gap-3 text-texto-3">
        <span>menos</span>
        <span
          className="h-2 w-40"
          style={{ background: `linear-gradient(to right, color-mix(in srgb, ${cor} 12%, var(--fundo)), ${cor})` }}
        />
        <span>mais</span>
        <span className="ml-3 inline-block size-2.5 bg-superficie-2" />
        <span>sem dados</span>
        <span className="ml-3">Arraste para mover · ⌘/Ctrl + rolagem para zoom</span>
      </div>
    </div>
  )
}

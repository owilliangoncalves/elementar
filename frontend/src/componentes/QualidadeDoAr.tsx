import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Extremo, MesAr, PoluenteAr, QualidadeDoAr as Dados } from '../lib/api'
import { corDoPoluente } from '../lib/cores'
import { fmtData } from '../lib/formato'
import { Aviso, Carregando, Falha, Numero } from './ui'

const NOMES: Record<string, { curto: ReactNode; longo: string }> = {
  pm25: { curto: <>MP<sub>2,5</sub></>, longo: 'Material particulado fino' },
  pm10: { curto: <>MP<sub>10</sub></>, longo: 'Material particulado inalável' },
  o3: { curto: <>O<sub>3</sub></>, longo: 'Ozônio' },
  no2: { curto: <>NO<sub>2</sub></>, longo: 'Dióxido de nitrogênio' },
  so2: { curto: <>SO<sub>2</sub></>, longo: 'Dióxido de enxofre' },
  co: { curto: 'CO', longo: 'Monóxido de carbono' },
}

// Para o seletor da barra de fontes: uma <option> não aceita subscrito.
export const OPCOES_POLUENTE = [
  { valor: 'pm25', rotulo: 'Material particulado fino (MP2,5)' },
  { valor: 'pm10', rotulo: 'Material particulado inalável (MP10)' },
  { valor: 'o3', rotulo: 'Ozônio (O3)' },
  { valor: 'no2', rotulo: 'Dióxido de nitrogênio (NO2)' },
  { valor: 'so2', rotulo: 'Dióxido de enxofre (SO2)' },
  { valor: 'co', rotulo: 'Monóxido de carbono (CO)' },
]

// CO vem em ppm, com valores como 0,16: precisa de mais casas.
const decimal = (poluente: string) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: poluente === 'co' ? 2 : 1 })

const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dataDoMes = (mes: string) => new Date(`${mes}-01T00:00:00Z`)
const fmtMes = (mes: string, formato = MES_CURTO) => formato.format(dataDoMes(mes)).replace('.', '').replace(' de ', ' ')

function proximoMes(mes: string) {
  const d = dataDoMes(mes)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 7)
}

interface Ponto {
  mes: string
  faixa: [number, number] | null
  media: number | null
  reanalise: number | null
  previsao: number | null
  dados: MesAr | null
}

// Todos os meses do período, com null onde faltam dados: a linha mostra o buraco
// em vez de ligar meses distantes. A previsão começa no último mês da reanálise,
// para o tracejado continuar a linha sem salto.
function serie(meses: MesAr[]): Ponto[] {
  if (!meses.length) return []
  const porMes = new Map(meses.map((m) => [m.mes, m]))
  const pontos: Ponto[] = []
  for (let mes = meses[0].mes; mes <= meses.at(-1)!.mes; mes = proximoMes(mes)) {
    const m = porMes.get(mes) ?? null
    pontos.push({
      mes,
      faixa: m ? [m.minimo, m.maximo] : null,
      media: m?.media ?? null,
      reanalise: m?.origem === 'reanalise' ? m.media : null,
      previsao: m?.origem === 'previsao' ? m.media : null,
      dados: m,
    })
  }
  for (let i = 1; i < pontos.length; i++)
    if (pontos[i].previsao != null && pontos[i - 1].reanalise != null) pontos[i - 1].previsao = pontos[i - 1].reanalise
  return pontos
}

// O poluente é escolhido na barra de fontes (RegistrosPorParametro).
export function QualidadeDoAr({
  consulta: { data, error, isPending },
  poluente: escolhido,
}: {
  consulta: UseQueryResult<Dados>
  poluente: string
}) {
  if (isPending) return <Carregando texto="Carregando a qualidade do ar…" />
  if (error) return <Falha erro={error} />
  if (!data.poluentes.length) return <Aviso>Ainda não há dados de qualidade do ar para este município.</Aviso>

  const poluente = data.poluentes.find((p) => p.poluente === escolhido) ?? data.poluentes[0]

  return (
    <div>
      <p className="mb-4 text-sm text-texto-2">
        Estimativas diárias do SISAM (INPE), calculadas por modelo atmosférico e não medidas em estações.
        {data.distrito_federal && ' O SISAM não separa as Regiões Administrativas: os valores são do Distrito Federal inteiro.'}
      </p>
      <Poluente key={poluente.poluente} poluente={poluente} />
    </div>
  )
}

function Poluente({ poluente: p }: { poluente: PoluenteAr }) {
  const cor = corDoPoluente(p.poluente)
  const fmt = decimal(p.poluente).format
  const pontos = serie(p.por_mes)
  const temPrevisao = p.por_mes.some((m) => m.origem === 'previsao')
  const nome = NOMES[p.poluente]

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 rounded-2xl border border-linha bg-superficie p-5">
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold">
          {nome?.longo ?? p.poluente}
          <span className="text-sm font-semibold text-texto-3">{nome?.curto}, média mensal em {p.unidade}</span>
        </h3>
        <Grafico pontos={pontos} poluente={p} cor={cor} fmt={fmt} />
        <Legenda cor={cor} temPrevisao={temPrevisao} />
        <TabelaMensal meses={p.por_mes} unidade={p.unidade} fmt={fmt} />
      </div>

      <aside>
        <div className="border-b-2 border-texto pb-2 font-bold">Extremos diários</div>
        <Numero rotulo="Maior valor diário" valor={<Valor valor={p.maximo.valor} unidade={p.unidade} fmt={fmt} />} nota={notaExtremo(p.maximo)} />
        <Numero rotulo="Menor valor diário" valor={<Valor valor={p.minimo.valor} unidade={p.unidade} fmt={fmt} />} nota={notaExtremo(p.minimo)} />
        <Numero
          rotulo="Período com dados"
          valor={
            pontos.length > 1
              ? `${dataDoMes(pontos[0].mes).getUTCFullYear()}–${dataDoMes(pontos.at(-1)!.mes).getUTCFullYear()}`
              : fmtMes(pontos[0].mes)
          }
          nota={`${p.por_mes.length} ${p.por_mes.length === 1 ? 'mês' : 'meses'}, de ${fmtMes(pontos[0].mes)} a ${fmtMes(pontos.at(-1)!.mes)}`}
        />
      </aside>
    </div>
  )
}

function Valor({ valor, unidade, fmt }: { valor: number; unidade: string; fmt: (n: number) => string }) {
  return (
    <>
      {fmt(valor)}
      <span className="ml-1.5 font-sans text-base font-semibold text-texto-3">{unidade}</span>
    </>
  )
}

function notaExtremo(e: Extremo) {
  return e.dias > 1 ? `em ${fmtData(e.data)}, o mais recente de ${e.dias} dias com esse valor` : `em ${fmtData(e.data)}`
}

interface RotuloExtremoProps {
  viewBox?: { x?: number; y?: number }
}

function Grafico({
  pontos,
  poluente: p,
  cor,
  fmt,
}: {
  pontos: Ponto[]
  poluente: PoluenteAr
  cor: string
  fmt: (n: number) => string
}) {
  const longo = pontos.length > 24
  // Série longa: um rótulo por ano, em janeiro; curta: o mês de cada ponto.
  const ticks = longo ? pontos.filter((pt) => pt.mes.endsWith('-01')).map((pt) => pt.mes) : undefined
  const indice = (mes: string) => pontos.findIndex((pt) => pt.mes === mes)

  // O rótulo do extremo encosta no ponto e se afasta da borda do gráfico.
  const rotulo = (texto: string, mes: string, acima: boolean) => {
    const posicao = indice(mes) / Math.max(1, pontos.length - 1)
    const ancora = posicao < 0.15 ? 'start' : posicao > 0.85 ? 'end' : 'middle'
    return ({ viewBox }: RotuloExtremoProps) => (
      <text
        x={(viewBox?.x ?? 0) + (ancora === 'start' ? -4 : ancora === 'end' ? 4 : 0)}
        y={(viewBox?.y ?? 0) + (acima ? -12 : 20)}
        textAnchor={ancora}
        fontSize={12}
        fontWeight={700}
        fill="var(--texto)"
      >
        {texto}
      </text>
    )
  }

  // Um mês isolado entre buracos não forma linha: vira um ponto.
  const pontoIsolado =
    (chave: 'reanalise' | 'previsao') =>
    ({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => {
      const i = index ?? -1
      const isolado = pontos[i]?.[chave] != null && pontos[i - 1]?.[chave] == null && pontos[i + 1]?.[chave] == null
      return isolado ? (
        <circle key={`${chave}-${i}`} cx={cx} cy={cy} r={4} fill={cor} stroke="var(--superficie)" strokeWidth={2} />
      ) : (
        <g key={`${chave}-${i}`} />
      )
    }

  const extremo = (e: Extremo, acima: boolean, prefixo: string) => (
    <ReferenceDot
      x={e.data.slice(0, 7)}
      y={e.valor}
      r={5}
      fill={cor}
      stroke="var(--superficie)"
      strokeWidth={2}
      ifOverflow="visible"
      label={rotulo(`${prefixo} ${fmt(e.valor)}`, e.data.slice(0, 7), acima)}
    />
  )

  return (
    <div className="mt-4 h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pontos} margin={{ top: 28, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--linha)" />
          <XAxis
            dataKey="mes"
            ticks={ticks}
            interval={longo ? 0 : 'preserveStartEnd'}
            tickFormatter={(mes: string) => (longo ? mes.slice(0, 4) : fmtMes(mes))}
            tickLine={false}
            axisLine={{ stroke: 'var(--linha)' }}
            tick={{ fill: 'var(--texto-3)', fontSize: 11 }}
            minTickGap={12}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--texto-3)', fontSize: 11 }}
            tickFormatter={(v: number) => fmt(v)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--texto-3)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const m = (payload?.[0]?.payload as Ponto | undefined)?.dados
              if (!active || !payload?.length) return null
              const mes = (payload[0].payload as Ponto).mes
              return (
                <div className="rounded-xl border border-linha bg-superficie px-3 py-2 text-sm shadow-lg shadow-black/20">
                  <div className="font-bold text-texto first-letter:uppercase">{fmtMes(mes, MES_LONGO)}</div>
                  {m ? (
                    <>
                      <div className="mt-0.5 flex items-center gap-1.5 text-texto-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: cor }} />
                        <span className="font-semibold text-texto">{fmt(m.media)}</span> {p.unidade} de média
                      </div>
                      <div className="text-texto-2">
                        de {fmt(m.minimo)} a {fmt(m.maximo)} nos {m.dias} dias
                      </div>
                      {m.origem === 'previsao' && <div className="text-texto-3">Previsão do dia, ainda sem reanálise</div>}
                    </>
                  ) : (
                    <div className="text-texto-3">Sem dados neste mês</div>
                  )}
                </div>
              )
            }}
          />
          <Area dataKey="faixa" stroke="none" fill={cor} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
          <Line
            dataKey="reanalise"
            stroke={cor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={pontoIsolado('reanalise')}
            activeDot={{ r: 4, fill: cor, stroke: 'var(--superficie)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="previsao"
            stroke={cor}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            dot={pontoIsolado('previsao')}
            activeDot={{ r: 4, fill: cor, stroke: 'var(--superficie)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {extremo(p.maximo, true, 'máx.')}
          {extremo(p.minimo, false, 'mín.')}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Legenda({ cor, temPrevisao }: { cor: string; temPrevisao: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-texto-2">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: cor }} />
        Média mensal
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm" style={{ background: cor, opacity: 0.25 }} />
        Do menor ao maior valor diário do mês
      </span>
      {temPrevisao && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: cor }} />
          Previsão do dia, nos meses ainda sem reanálise
        </span>
      )}
    </div>
  )
}

function TabelaMensal({ meses, unidade, fmt }: { meses: MesAr[]; unidade: string; fmt: (n: number) => string }) {
  return (
    <details className="mt-4 border-t border-linha pt-3 text-sm">
      <summary className="cursor-pointer font-semibold text-texto-2 hover:text-texto">Ver os valores mensais</summary>
      <div className="mt-3 max-h-80 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="sticky top-0 bg-superficie text-texto-3">
            <tr>
              <th className="py-1.5 pr-4 font-semibold">Mês</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Média ({unidade})</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Menor</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Maior</th>
              <th className="py-1.5 font-semibold">Origem</th>
            </tr>
          </thead>
          <tbody>
            {[...meses].reverse().map((m) => (
              <tr key={m.mes} className="border-t border-linha">
                <td className="py-1.5 pr-4 first-letter:uppercase">{fmtMes(m.mes)}</td>
                <td className="py-1.5 pr-4 text-right font-semibold">{fmt(m.media)}</td>
                <td className="py-1.5 pr-4 text-right">{fmt(m.minimo)}</td>
                <td className="py-1.5 pr-4 text-right">{fmt(m.maximo)}</td>
                <td className="py-1.5 text-texto-2">{m.origem === 'previsao' ? 'Previsão' : 'Reanálise'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

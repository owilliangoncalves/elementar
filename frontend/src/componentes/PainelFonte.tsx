import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { Ano } from '../lib/api'
import { fmt, fmtCompacto } from '../lib/formato'

interface Props<T extends Ano> {
  titulo: string
  descricao: string
  cor: string
  porAno: T[] | null
  valor: (ano: T) => number
  unidade: string
}

interface RotuloProps {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: unknown
  index?: number
}

// Valor acima da barra; o ano mais recente fica em destaque.
function Rotulo({ x, y, width, value, empilhar, recente }: RotuloProps & { empilhar: boolean; recente: boolean }) {
  const [numero, sufixo] = fmtCompacto(Number(value)).split(/\s/)
  const centro = Number(x) + Number(width) / 2
  const estilo = { fill: recente ? 'var(--texto)' : 'var(--texto-3)', fontFamily: "'Anton', sans-serif" }
  if (empilhar && sufixo)
    return (
      <text x={centro} y={Number(y) - 15} textAnchor="middle" style={estilo}>
        <tspan fontSize={13}>{numero}</tspan>
        <tspan x={centro} dy={10} fontSize={8}>
          {sufixo}
        </tspan>
      </text>
    )
  return (
    <text x={centro} y={Number(y) - 6} textAnchor="middle" fontSize={recente ? 16 : 13} style={estilo}>
      {sufixo ? `${numero} ${sufixo}` : numero}
    </text>
  )
}

// Uma fonte do município: barras por ano, com o mais recente em destaque.
export function PainelFonte<T extends Ano>({ titulo, descricao, cor, porAno, valor, unidade }: Props<T>) {
  const anos = porAno ? [...porAno].sort((a, b) => a.ano - b.ano) : []
  const recente = anos.at(-1)?.ano
  // Com muitos anos as barras ficam estreitas: o rótulo "3,2 mil" vira duas linhas.
  const empilhar = anos.length > 8

  return (
    <div className="flex min-w-0 flex-col ficha p-5 md:p-6">
      <h3 className="manchete flex items-center gap-2 text-3xl">
        <span className="size-3" style={{ background: cor }} />
        {titulo}
      </h3>
      <p className="maquina mt-2 text-sm text-texto-2">{descricao}</p>

      {!anos.length ? (
        <div className="maquina py-16 text-center text-texto-3">Sem dados para este município nesta fonte.</div>
      ) : (
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={anos.map((a) => ({ ano: a.ano, valor: valor(a) }))} margin={{ top: empilhar ? 28 : 18, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="ano"
                tickLine={false}
                axisLine={{ stroke: 'var(--linha)' }}
                tick={{ fill: 'var(--texto-3)', fontSize: 10, fontFamily: "'JetBrains Mono Variable', monospace" }}
                tickFormatter={(ano: number) => (anos.length > 8 ? `’${String(ano).slice(2)}` : String(ano))}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: 'var(--superficie-2)' }}
                isAnimationActive={false}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="faixa-tinta px-3 py-2 text-sm shadow-[4px_4px_0_var(--color-sul)]">
                      <div className="rotulo text-texto">{label}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-texto-2">
                        <span className="size-2.5" style={{ background: cor }} />
                        <span className="font-semibold text-texto">{fmt(Number(payload[0].value))}</span> {unidade}
                      </div>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="valor"
                radius={0}
                label={(props: RotuloProps) => (
                  <Rotulo {...props} empilhar={empilhar} recente={anos[props.index ?? -1]?.ano === recente} />
                )}
              >
                {anos.map((a) => (
                  <Cell key={a.ano} fill={cor} fillOpacity={a.ano === recente ? 1 : 0.35} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

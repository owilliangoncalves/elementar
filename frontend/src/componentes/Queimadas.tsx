import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import type { Queimadas as Dados } from '../lib/api'
import { fmt, fmtData } from '../lib/formato'
import { Aviso, Barra, Carregando, Falha, Numero, cn } from './ui'

// Escala sequencial de um só matiz (index.css): 0 fica de fora, em cinza.
const NIVEIS = 5
const COR_NIVEL = Array.from({ length: NIVEIS }, (_, i) => `var(--fogo-${i + 1})`)

const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const INICIAIS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 1)).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
)
const fmtMes = (mes: string, formato = MES_LONGO) =>
  formato.format(new Date(`${mes}-01T00:00:00Z`)).replace('.', '').replace(' de ', ' ')
const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`

// Raiz quadrada: poucos focos ainda aparecem quando o pior mês tem centenas.
const nivel = (focos: number, maior: number) => Math.max(1, Math.ceil(Math.sqrt(focos / maior) * NIVEIS))

// Faixas de focos de cada nível, para a legenda; níveis sem inteiro somem.
function faixas(maior: number) {
  return COR_NIVEL.map((cor, i) => ({
    cor,
    de: Math.floor(maior * (i / NIVEIS) ** 2) + 1,
    ate: Math.floor(maior * ((i + 1) / NIVEIS) ** 2),
  })).filter((f) => f.de <= f.ate)
}

export function Queimadas({ consulta: { data, error, isPending } }: { consulta: UseQueryResult<Dados> }) {
  if (isPending) return <Carregando texto="Carregando os focos de queimadas…" />
  if (error) return <Falha erro={error} />

  const nota = (
    <p className="maquina mb-6 max-w-3xl text-sm text-texto-2">
      Focos de fogo ativo detectados pelo satélite de referência do INPE (AQUA, na passagem da tarde). Cada foco é um
      ponto de cerca de 1 km com fogo no momento da passagem: não é o número de incêndios nem a área queimada, e fogo
      pequeno ou sob nuvens pode não ser detectado.
      {data.distrito_federal && ' O INPE não separa as Regiões Administrativas: os focos são do Distrito Federal inteiro.'}
    </p>
  )

  if (!data.total)
    return (
      <div>
        {nota}
        <Aviso>
          Nenhum foco detectado de {fmtMes(data.inicio, MES_CURTO)} a {fmtData(data.atualizado_ate)}.
        </Aviso>
      </div>
    )

  return (
    <div>
      {nota}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Calendario dados={data} />
        <Resumo dados={data} />
      </div>
    </div>
  )
}

function Calendario({ dados }: { dados: Dados }) {
  const porMes = new Map(dados.por_mes.map((m) => [m.mes, m.focos]))
  const maior = dados.pior_mes?.focos ?? 1
  const primeiroAno = Number(dados.inicio.slice(0, 4))
  const ultimoAno = Number(dados.fim.slice(0, 4))
  const anos = Array.from({ length: ultimoAno - primeiroAno + 1 }, (_, i) => primeiroAno + i)
  const totalDoAno = (ano: number) =>
    dados.por_mes.filter((m) => m.mes.startsWith(String(ano))).reduce((t, m) => t + m.focos, 0)
  const maiorAno = Math.max(1, ...anos.map(totalDoAno))
  const [foco, setFoco] = useState<string | null>(null)

  const descricao = (mes: string) => {
    const n = porMes.get(mes) ?? 0
    const parcial = mes === dados.fim ? `, até ${fmtData(dados.atualizado_ate)}` : ''
    return `${fmtMes(mes)}: ${n ? fmt(n) : 'nenhum'} ${n === 1 ? 'foco' : 'focos'}${parcial}`
  }

  return (
    <div className="min-w-0 ficha p-5">
      <h3 className="manchete text-3xl">Focos por mês</h3>
      <p aria-live="polite" className="maquina mt-2 min-h-5 text-sm text-texto-2 first-letter:uppercase">
        {foco ? descricao(foco) : 'Passe o mouse ou toque em um mês para ver os focos.'}
      </p>

      <table className="mt-4 w-full border-separate border-spacing-0.5 font-mono text-[11px]" onMouseLeave={() => setFoco(null)}>
        <thead>
          <tr className="text-texto-3">
            <th className="w-10" />
            {INICIAIS.map((m) => (
              <th key={m} scope="col" className="pb-1 font-semibold">
                <abbr title={m} className="no-underline">
                  {m.charAt(0).toUpperCase()}
                </abbr>
              </th>
            ))}
            <th scope="col" className="pb-1 pl-2 text-left font-semibold sm:w-[22%] sm:pl-3">
              No ano
            </th>
          </tr>
        </thead>
        <tbody>
          {anos.map((ano) => {
            const total = totalDoAno(ano)
            return (
              <tr key={ano}>
                <th scope="row" className="pr-2 text-right font-semibold text-texto-2 tabular-nums">
                  {ano}
                </th>
                {INICIAIS.map((_, i) => {
                  const mes = chave(ano, i + 1)
                  if (mes < dados.inicio || mes > dados.fim)
                    return (
                      <td key={mes}>
                        <span className="block h-6 border border-dashed border-linha sm:h-7" />
                      </td>
                    )
                  const n = porMes.get(mes) ?? 0
                  return (
                    <td key={mes}>
                      <button
                        type="button"
                        aria-label={descricao(mes)}
                        onMouseEnter={() => setFoco(mes)}
                        onFocus={() => setFoco(mes)}
                        onBlur={() => setFoco(null)}
                        className={cn(
                          'block h-6 w-full outline-offset-1 focus-visible:outline-2 focus-visible:outline-texto sm:h-7',
                          foco === mes && 'ring-2 ring-texto',
                          !n && 'bg-superficie-2',
                        )}
                        style={n ? { background: COR_NIVEL[nivel(n, maior) - 1] } : undefined}
                      />
                    </td>
                  )
                })}
                <td className="pl-2 sm:pl-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-right font-display text-lg text-texto sm:w-12">{fmt(total)}</span>
                    <span className="hidden min-w-0 flex-1 sm:block">
                      <Barra fracao={total / maiorAno} cor="var(--fogo-3)" />
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Legenda maior={maior} />
      <TabelaAnual dados={dados} anos={anos} porMes={porMes} totalDoAno={totalDoAno} />
    </div>
  )
}

function Legenda({ maior }: { maior: number }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-texto-2">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-4 bg-superficie-2" />
        Nenhum
      </span>
      {faixas(maior).map((f) => (
        <span key={f.cor} className="flex items-center gap-1.5">
          <span className="h-3 w-4" style={{ background: f.cor }} />
          {f.de === f.ate ? fmt(f.de) : `${fmt(f.de)} a ${fmt(f.ate)}`}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-4 border border-dashed border-linha" />
        Fora do período
      </span>
    </div>
  )
}

function TabelaAnual({
  dados,
  anos,
  porMes,
  totalDoAno,
}: {
  dados: Dados
  anos: number[]
  porMes: Map<string, number>
  totalDoAno: (ano: number) => number
}) {
  return (
    <details className="mt-5 border-t border-linha pt-3 font-mono text-xs">
      <summary className="rotulo cursor-pointer text-texto-2 hover:text-texto">Ver os números por mês</summary>
      <div className="mt-3 max-h-80 overflow-auto">
        <table className="w-full text-right tabular-nums">
          <thead className="rotulo sticky top-0 bg-fundo text-texto-3">
            <tr>
              <th className="py-1.5 pr-3 text-left font-semibold">Ano</th>
              {INICIAIS.map((m) => (
                <th key={m} className="py-1.5 pr-3 font-semibold">
                  {m}
                </th>
              ))}
              <th className="py-1.5 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...anos].reverse().map((ano) => (
              <tr key={ano} className="border-t border-linha">
                <td className="py-1.5 pr-3 text-left font-semibold">{ano}</td>
                {INICIAIS.map((_, i) => {
                  const mes = chave(ano, i + 1)
                  const fora = mes < dados.inicio || mes > dados.fim
                  return (
                    <td key={mes} className={cn('py-1.5 pr-3', fora ? 'text-texto-3' : 'text-texto-2')}>
                      {fora ? '' : fmt(porMes.get(mes) ?? 0)}
                    </td>
                  )
                })}
                <td className="py-1.5 font-semibold">{fmt(totalDoAno(ano))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Resumo({ dados }: { dados: Dados }) {
  const unico = dados.biomas.length === 1 ? dados.biomas[0].bioma : null
  return (
    <aside>
      <div className="manchete border-b-4 border-sul pb-3 text-3xl">Em números</div>
      <Numero
        rotulo={`Focos desde ${dados.inicio.slice(0, 4)}`}
        valor={fmt(dados.total)}
        nota={`até ${fmtData(dados.atualizado_ate)}${unico ? `, todos no bioma ${unico}` : ''}`}
      />
      {dados.pior_mes && (
        <Numero
          rotulo="Mês com mais focos"
          valor={fmt(dados.pior_mes.focos)}
          nota={`em ${fmtMes(dados.pior_mes.mes)}`}
        />
      )}
      {dados.pior_dia && (
        <Numero rotulo="Dia com mais focos" valor={fmt(dados.pior_dia.focos)} nota={`em ${fmtData(dados.pior_dia.data)}`} />
      )}
      {!unico && dados.biomas.length > 1 && (
        <div className="py-4">
          <div className="rotulo mb-3 text-texto-2">Por bioma</div>
          <ul className="grid gap-2 text-sm">
            {dados.biomas.map((b) => (
              <li key={b.bioma}>
                <div className="flex justify-between gap-3">
                  <span>{b.bioma}</span>
                  <span className="font-semibold">{fmt(b.focos)}</span>
                </div>
                <Barra fracao={b.focos / dados.biomas[0].focos} cor="var(--fogo-3)" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

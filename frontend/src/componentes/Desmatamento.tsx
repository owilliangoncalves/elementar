import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import type { Desmatamento as Dados } from '../lib/api'
import { fmt, fmtData } from '../lib/formato'
import { Aviso, Barra, Carregando, Falha, Numero, cn } from './ui'

const MATA = 'var(--mata)'
const MATA_CLARO = 'var(--mata-claro)'
const PLATAFORMA = 'https://plataforma.alerta.mapbiomas.org'

// Áreas pequenas precisam de uma casa decimal para não virarem zero.
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const fmtHa = (n: number) => (n > 0 && n < 10 ? decimal.format(n) : fmt(Math.round(n)))
const porcento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const fmtPorcento = (n: number) => (n > 0 && n < 0.01 ? 'menos de 1%' : porcento.format(n))
const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtMes = (mes: string) => MES_LONGO.format(new Date(`${mes}-01T00:00:00Z`))

// Cruzamentos que a API calcula, agrupados como o MapBiomas os apresenta.
const GRUPOS: { titulo: string; itens: [string, string][] }[] = [
  {
    titulo: 'Imóveis rurais',
    itens: [
      ['car', 'Em imóvel rural do CAR'],
      ['reserva_legal', 'Em reserva legal'],
      ['app', 'Em área de preservação permanente'],
      ['nascente', 'Sobre nascentes'],
      ['embargo', 'Em imóvel já embargado'],
      ['autorizacao', 'Com autorização de supressão ou manejo'],
    ],
  },
  {
    titulo: 'Áreas protegidas e territórios',
    itens: [
      ['terra_indigena', 'Em terra indígena'],
      ['unidade_conservacao', 'Em unidade de conservação'],
      ['assentamento', 'Em assentamento'],
      ['quilombo', 'Em território quilombola'],
    ],
  },
]

const rotuloFaixa = (de: number, ate: number | null) =>
  ate == null ? `mais de ${fmt(de)} ha` : de === 0 ? `menos de ${fmt(ate)} ha` : `${fmt(de)} a ${fmt(ate)} ha`

export function Desmatamento({ consulta: { data, error, isPending } }: { consulta: UseQueryResult<Dados> }) {
  if (isPending) return <Carregando texto="Carregando os alertas de desmatamento…" />
  if (error) return <Falha erro={error} />

  const nota = (
    <p className="maquina mb-6 max-w-3xl text-sm text-texto-2">
      Alertas de desmatamento validados pelo{' '}
      <a href={PLATAFORMA} target="_blank" rel="noreferrer" className="font-semibold text-texto underline">
        MapBiomas Alerta
      </a>{' '}
      (CC BY 4.0), confirmados com imagens de satélite de antes e depois. Cada alerta conta pela data de detecção e
      só pela área dentro do município. Detecções de {fmtMes(data.inicio)} a {fmtMes(data.fim)}
      {data.atualizado_em && `, no relatório de ${fmtData(data.atualizado_em)}`}.
      {data.distrito_federal && ' O MapBiomas não separa as Regiões Administrativas: os alertas são do Distrito Federal inteiro.'}
    </p>
  )

  if (!data.alertas)
    return (
      <div>
        {nota}
        <Aviso>
          Nenhum alerta de desmatamento validado de {fmtMes(data.inicio)} a {fmtMes(data.fim)}.
        </Aviso>
      </div>
    )

  return (
    <div>
      {nota}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid min-w-0 gap-4">
          <PorAno dados={data} />
          <Tamanhos dados={data} />
          <Cruzamentos dados={data} />
        </div>
        <Resumo dados={data} />
      </div>
    </div>
  )
}

function PorAno({ dados }: { dados: Dados }) {
  const [foco, setFoco] = useState<number | null>(null)
  const maior = Math.max(...dados.por_ano.map((a) => a.area_ha))
  const pico = dados.por_ano.find((a) => a.area_ha === maior)?.ano
  const ultimoAno = Number(dados.fim.slice(0, 4))
  // O ano corrente só tem os meses já detectados e validados.
  const parcial = dados.fim.endsWith('-12') ? null : ultimoAno

  const descricao = (ano: number) => {
    const a = dados.por_ano.find((x) => x.ano === ano)!
    const ate = ano === parcial ? `, até ${fmtMes(dados.fim)}` : ''
    return a.alertas
      ? `${ano}: ${fmtHa(a.area_ha)} ha em ${fmt(a.alertas)} ${a.alertas === 1 ? 'alerta' : 'alertas'}${ate}`
      : `${ano}: nenhum alerta${ate}`
  }

  return (
    <section className="ficha p-5">
      <h3 className="manchete text-3xl">Área desmatada por ano</h3>
      <p aria-live="polite" className="maquina mt-2 min-h-5 text-sm text-texto-2">
        {foco != null ? descricao(foco) : 'Passe o mouse ou toque em um ano para ver a área e os alertas.'}
      </p>

      <div className="mt-6 flex h-48 items-end gap-0.5 border-b border-linha" onMouseLeave={() => setFoco(null)}>
        {dados.por_ano.map((a) => (
          <button
            key={a.ano}
            type="button"
            aria-label={descricao(a.ano)}
            onMouseEnter={() => setFoco(a.ano)}
            onFocus={() => setFoco(a.ano)}
            onBlur={() => setFoco(null)}
            className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-offset-2 focus-visible:outline-2 focus-visible:outline-texto"
          >
            {a.ano === pico && maior > 0 && (
              <span className="pb-1 text-center text-xs font-semibold whitespace-nowrap text-texto tabular-nums">
                {fmtHa(a.area_ha)} ha
              </span>
            )}
            <span
              className={cn('mx-auto block w-3/4', foco === a.ano && 'ring-2 ring-texto ring-offset-2 ring-offset-fundo')}
              style={{
                height: a.area_ha ? `max(2px, ${(a.area_ha / maior) * 85}%)` : 0,
                background:
                  a.ano === parcial
                    ? `repeating-linear-gradient(135deg, ${MATA} 0 3px, transparent 3px 6px)`
                    : MATA,
                boxShadow: a.ano === parcial ? `inset 0 0 0 1.5px ${MATA}` : undefined,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-center font-mono text-[11px] text-texto-3">
        {dados.por_ano.map((a) => (
          <span key={a.ano} className="flex-1">
            {a.ano}
          </span>
        ))}
      </div>
      {parcial && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-texto-2">
          <span
            className="h-3 w-4"
            style={{
              background: `repeating-linear-gradient(135deg, ${MATA} 0 3px, transparent 3px 6px)`,
              boxShadow: `inset 0 0 0 1.5px ${MATA}`,
            }}
          />
          {parcial} parcial, com detecções até {fmtMes(dados.fim)}
        </p>
      )}

      <details className="mt-5 border-t border-linha pt-3 font-mono text-xs">
        <summary className="rotulo cursor-pointer text-texto-2 hover:text-texto">Ver os números por ano</summary>
        <table className="mt-3 w-full text-right tabular-nums">
          <thead className="rotulo text-texto-3">
            <tr>
              <th className="py-1.5 pr-4 text-left font-semibold">Ano</th>
              <th className="py-1.5 pr-4 font-semibold">Alertas</th>
              <th className="py-1.5 font-semibold">Área (ha)</th>
            </tr>
          </thead>
          <tbody>
            {[...dados.por_ano].reverse().map((a) => (
              <tr key={a.ano} className="border-t border-linha">
                <td className="py-1.5 pr-4 text-left font-semibold">
                  {a.ano}
                  {a.ano === parcial && <span className="ml-1.5 font-normal text-texto-3">parcial</span>}
                </td>
                <td className="py-1.5 pr-4 text-texto-2">{fmt(a.alertas)}</td>
                <td className="py-1.5 font-semibold">{fmtHa(a.area_ha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

// A partir da maior faixa, as que juntas passam da metade da área.
function concentracao(dados: Dados) {
  let alertas = 0
  let area = 0
  for (let i = dados.tamanhos.length - 1; i >= 0; i--) {
    alertas += dados.tamanhos[i].alertas
    area += dados.tamanhos[i].area_ha
    if (area >= dados.area_ha / 2) return { de: dados.tamanhos[i].de, alertas: alertas / dados.alertas, area: area / dados.area_ha }
  }
  return null
}

function Tamanhos({ dados }: { dados: Dados }) {
  const faixas = dados.tamanhos.map((t) => ({
    ...t,
    partAlertas: t.alertas / dados.alertas,
    partArea: t.area_ha / dados.area_ha,
  }))
  const escala = Math.max(...faixas.flatMap((f) => [f.partAlertas, f.partArea]))
  const c = concentracao(dados)

  return (
    <section className="ficha p-5">
      <h3 className="manchete text-3xl">Tamanho dos alertas</h3>
      {c && c.de > 0 && (
        <p className="maquina mt-2 max-w-xl text-sm text-texto-2">
          Alertas de {fmt(c.de)} ha ou mais são{' '}
          <strong className="font-semibold text-texto">{fmtPorcento(c.alertas)} dos alertas</strong> e somam{' '}
          <strong className="font-semibold text-texto">{fmtPorcento(c.area)} da área</strong> desmatada.
        </p>
      )}

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="rotulo text-right text-texto-2">Parte dos alertas</span>
        <span />
        <span className="rotulo text-texto-2">Parte da área</span>
        {faixas.map((f) => (
          <Linha key={f.de} faixa={f} escala={escala} />
        ))}
      </div>
    </section>
  )
}

function Linha({
  faixa: f,
  escala,
}: {
  faixa: Dados['tamanhos'][number] & { partAlertas: number; partArea: number }
  escala: number
}) {
  const rotulo = rotuloFaixa(f.de, f.ate)
  const largura = (parte: number) => (parte ? `max(2px, ${(parte / escala) * 100}%)` : 0)
  return (
    <>
      <div
        className="flex items-center justify-end gap-2"
        title={`${rotulo}: ${fmt(f.alertas)} ${f.alertas === 1 ? 'alerta' : 'alertas'}`}
      >
        <span className="text-texto-2 tabular-nums">{fmtPorcento(f.partAlertas)}</span>
        <span className="flex h-4 w-3/4 justify-end">
          <span className="h-full" style={{ width: largura(f.partAlertas), background: MATA_CLARO }} />
        </span>
      </div>
      <span className="w-24 text-center font-semibold whitespace-nowrap text-texto">{rotulo}</span>
      <div className="flex items-center gap-2" title={`${rotulo}: ${fmtHa(f.area_ha)} ha`}>
        <span className="flex h-4 w-3/4">
          <span className="h-full" style={{ width: largura(f.partArea), background: MATA }} />
        </span>
        <span className="text-texto-2 tabular-nums">{fmtPorcento(f.partArea)}</span>
      </div>
    </>
  )
}

function Cruzamentos({ dados }: { dados: Dados }) {
  const porNome = new Map(dados.cruzamentos.map((c) => [c.cruzamento, c]))
  const grupos = GRUPOS.map((g) => ({
    ...g,
    itens: g.itens.filter(([nome]) => (porNome.get(nome)?.alertas ?? 0) > 0),
  })).filter((g) => g.itens.length)
  if (!grupos.length) return null

  return (
    <section className="ficha p-5">
      <h3 className="manchete text-3xl">Onde os alertas caíram</h3>
      <p className="maquina mt-2 text-sm text-texto-2">
        Parte da área desmatada em alertas que cruzam cada categoria. Um alerta pode cruzar mais de uma, então as partes
        não somam 100%.
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <div className="rotulo mb-3 text-texto-2">{g.titulo}</div>
            <ul className="grid gap-3 text-sm">
              {g.itens.map(([nome, rotulo]) => {
                const c = porNome.get(nome)!
                return (
                  <li key={nome}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span>{rotulo}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{fmtPorcento(c.area_ha / dados.area_ha)}</span>
                    </div>
                    <Barra fracao={c.area_ha / dados.area_ha} cor={MATA} />
                    <div className="mt-0.5 text-xs text-texto-3 tabular-nums">
                      {fmtHa(c.area_ha)} ha em {fmt(c.alertas)} {c.alertas === 1 ? 'alerta' : 'alertas'}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function Resumo({ dados }: { dados: Dados }) {
  const pior = dados.por_ano.reduce((a, b) => (b.area_ha > a.area_ha ? b : a))
  const m = dados.maior
  return (
    <aside>
      <div className="manchete border-b-4 border-sul pb-3 text-3xl">Em números</div>
      <Numero
        rotulo={`Área desmatada desde ${dados.inicio.slice(0, 4)}`}
        valor={<ComUnidade valor={fmtHa(dados.area_ha)} unidade="ha" />}
        nota={`em ${fmt(dados.alertas)} ${dados.alertas === 1 ? 'alerta validado' : 'alertas validados'}`}
      />
      {m && (
        <Numero
          rotulo="Maior alerta"
          valor={<ComUnidade valor={fmtHa(m.area_municipio)} unidade="ha" />}
          nota={
            <>
              detectado em {fmtData(m.data)}
              {m.area_ha - m.area_municipio > 0.05 && `; tem ${fmtHa(m.area_ha)} ha ao todo, parte em município vizinho`}.{' '}
              <a
                href={`${PLATAFORMA}/alerta/${m.alerta}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-texto-2 underline hover:text-texto"
              >
                Ver o alerta {m.alerta} no MapBiomas
              </a>
            </>
          }
        />
      )}
      <Numero rotulo="Ano com mais área desmatada" valor={pior.ano} nota={`${fmtHa(pior.area_ha)} ha`} />
      {dados.biomas.length > 1 && (
        <div className="py-4">
          <div className="rotulo mb-3 text-texto-2">Por bioma</div>
          <ul className="grid gap-2 text-sm">
            {dados.biomas.map((b) => (
              <li key={b.bioma}>
                <div className="flex justify-between gap-3">
                  <span>{b.bioma}</span>
                  <span className="font-semibold tabular-nums">{fmtHa(b.area_ha)} ha</span>
                </div>
                <Barra fracao={b.area_ha / dados.biomas[0].area_ha} cor={MATA} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

function ComUnidade({ valor, unidade }: { valor: string; unidade: string }) {
  return (
    <>
      {valor}
      <span className="rotulo ml-2 text-texto-3">{unidade}</span>
    </>
  )
}

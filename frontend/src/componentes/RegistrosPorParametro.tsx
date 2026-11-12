import { type UseQueryResult, keepPreviousData, useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import {
  type Ano,
  type Municipio,
  type Numerico,
  type ParametroControle,
  type ParametroVigilancia,
  type Tabela,
  consultas,
} from '../lib/api'
import { corDoParametro, corDoPh, ehPh, gradienteDoPh } from '../lib/cores'
import { fmt, tituloNome } from '../lib/formato'
import { Aviso, Barra, Carregando, Falha, Pilula, Seletor, cn } from './ui'

const VIGILANCIA = 'var(--color-vigilancia)'
const CONTROLE = 'var(--color-controle)'
// Partes de um mesmo todo: um tom da cor da fonte, cada vez mais claro.
const TONS = [1, 0.55, 0.3, 0.16]
// Motivos são categorias distintas, não partes de uma escala: cada um tem cor própria.
const CORES_MOTIVO: Record<string, string> = {
  Rotina: 'var(--motivo-rotina)',
  Denúncia: 'var(--motivo-denuncia)',
  Desastre: 'var(--motivo-desastre)',
  Surto: 'var(--motivo-surto)',
}

// Uma cor só vira tons dela mesma; um mapa dá a cor de cada nome (cinza se faltar).
type Cor = string | Record<string, string>
const pintar = (cor: Cor, nome: string, i: number) =>
  typeof cor === 'string'
    ? { background: cor, opacity: TONS[Math.min(i, TONS.length - 1)] }
    : { background: cor[nome] ?? 'var(--texto-3)' }

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const porcento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const MESES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
)

// Os parâmetros da água no ano escolhido, um cartão por parâmetro, de cada fonte.
export function RegistrosPorParametro({ municipio }: { municipio: Municipio }) {
  const fontes: Record<Tabela, Ano[] | undefined> = {
    vigilancia: municipio.vigilancia?.por_ano,
    controle: municipio.controle_fora_do_padrao?.por_ano,
  }
  const anoMaisRecente = (t: Tabela) => Math.max(...(fontes[t] ?? []).map((a) => a.ano))

  const [tabela, setTabela] = useState<Tabela>(fontes.vigilancia ? 'vigilancia' : 'controle')
  const [ano, setAno] = useState(() => anoMaisRecente(tabela))
  const [motivo, setMotivo] = useState('')

  // Fica aqui, e não no cartão da vigilância, porque as opções do filtro de motivo vêm dela.
  const vigilancia = useQuery({
    ...consultas.resumoVigilancia(municipio.codigo_ibge, ano, motivo),
    enabled: tabela === 'vigilancia' && Boolean(fontes.vigilancia),
    placeholderData: keepPreviousData,
  })
  const motivos = somarMotivos(vigilancia.data ?? [])

  if (!fontes.vigilancia && !fontes.controle) return <Aviso>Sem análises da água para este município.</Aviso>

  const trocarTabela = (t: Tabela) => {
    setTabela(t)
    setAno(anoMaisRecente(t))
    setMotivo('')
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {fontes.vigilancia && (
          <Pilula ativa={tabela === 'vigilancia'} onClick={() => trocarTabela('vigilancia')}>
            Vigilância
          </Pilula>
        )}
        {fontes.controle && (
          <Pilula ativa={tabela === 'controle'} onClick={() => trocarTabela('controle')}>
            Controle fora do padrão
          </Pilula>
        )}
        <span className="flex-1" />
        <Seletor
          rotulo="Ano"
          valor={String(ano)}
          onMudar={(v) => {
            setAno(Number(v))
            setMotivo('')
          }}
          opcoes={(fontes[tabela] ?? [])
            .map((a) => a.ano)
            .sort((a, b) => b - a)
            .map((a) => ({ valor: String(a), rotulo: String(a) }))}
        />
        {tabela === 'vigilancia' && Object.keys(motivos).length > 1 && (
          <Seletor
            rotulo="Motivo da coleta"
            valor={motivo}
            onMudar={setMotivo}
            opcoes={[
              { valor: '', rotulo: 'Todos os motivos' },
              ...Object.entries(motivos)
                .sort((a, b) => b[1] - a[1])
                .map(([m]) => ({ valor: m, rotulo: m })),
            ]}
          />
        )}
      </div>
      {tabela === 'vigilancia' ? (
        <Vigilancia consulta={vigilancia} ano={ano} motivo={motivo} motivos={motivos} />
      ) : (
        <Controle codigo={municipio.codigo_ibge} ano={ano} />
      )}
    </div>
  )
}

// "motivos" vem sempre completo da API, mesmo com filtro: as opções não somem.
function somarMotivos(parametros: ParametroVigilancia[]) {
  const total: Record<string, number> = {}
  for (const p of parametros) for (const [m, n] of Object.entries(p.motivos)) total[m] = (total[m] ?? 0) + n
  return total
}

function Vigilancia({
  consulta: { data, error, isPending, isPlaceholderData },
  ano,
  motivo,
  motivos,
}: {
  consulta: UseQueryResult<ParametroVigilancia[]>
  ano: number
  motivo: string
  motivos: Record<string, number>
}) {
  if (isPending) return <Carregando texto="Calculando os gráficos…" />
  if (error) return <Falha erro={error} />
  // Com filtro, parâmetros sem análises daquele motivo vêm zerados.
  const parametros = data.filter((p) => p.analises > 0)
  if (!parametros.length)
    return <Aviso>Nenhuma análise {motivo ? `com motivo ${motivo.toLowerCase()} ` : ''}em {ano}.</Aviso>

  return (
    <div className={cn('transition-opacity', isPlaceholderData && 'opacity-50')}>
      <div className="mb-3 ficha p-4">
        <Divisao titulo="Motivo da coleta" partes={motivos} cor={CORES_MOTIVO} unidade="análises" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {parametros.map((p) => (
          <CartaoVigilancia key={p.parametro} p={p} />
        ))}
      </div>
    </div>
  )
}

function CartaoVigilancia({ p }: { p: ParametroVigilancia }) {
  const cor = corDoParametro(p.parametro, VIGILANCIA)
  // No pH a cor de cada barra vem do próprio valor, como no indicador universal.
  const ph = ehPh(p.parametro) && p.numerico ? p.numerico : null
  return (
    <Cartao
      titulo={p.parametro}
      total={p.analises}
      unidade={p.analises === 1 ? 'análise' : 'análises'}
      amostra={ph ? gradienteDoPh(ph.de, ph.ate) : cor}
    >
      {p.presenca ? (
        <Presenca {...p.presenca} cor={cor} />
      ) : p.numerico ? (
        <Histograma n={p.numerico} cor={ph ? corDoPh : () => cor} />
      ) : (
        <p className="maquina text-sm text-texto-3">Resultados sem valor numérico.</p>
      )}
      {p.abaixo_do_limite > 0 && (
        <p className="maquina mt-2 text-xs text-texto-3">
          Mais {fmt(p.abaixo_do_limite)} abaixo do limite de detecção ou quantificação do método.
        </p>
      )}
      <Meses
        cor={ph ? corDoPh(ph.mediana) : cor}
        valores={p.por_mes}
        destaque={p.presenca ? p.presentes_por_mes : undefined}
        rotuloDestaque="com presença"
      />
    </Cartao>
  )
}

function Cartao({
  titulo,
  total,
  unidade,
  amostra,
  children,
}: {
  titulo: string
  total: number
  unidade: string
  amostra: string
  children: ReactNode
}) {
  return (
    <article className="flex min-w-0 flex-col ficha p-4">
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-dashed border-linha pb-3">
        <h3 className="manchete flex items-center gap-2 text-2xl">
          <span aria-hidden className="h-2.5 w-4 shrink-0" style={{ background: amostra }} />
          {titulo}
        </h3>
        <span className="shrink-0 font-mono text-xs text-texto-2">
          <span className="font-bold text-texto">{fmt(total)}</span> {unidade}
        </span>
      </header>
      {children}
    </article>
  )
}

// Microbiológicos: o laudo diz só se o organismo estava presente ou ausente.
function Presenca({ presente, ausente, cor }: { presente: number; ausente: number; cor: string }) {
  const total = presente + ausente
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none" style={{ color: cor }}>
          {fmt(presente)}
        </span>
        <span className="text-sm text-texto-2">
          com presença, {porcento.format(presente / total)} das análises
        </span>
      </div>
      <Empilhada
        itens={[
          ['Presente', presente],
          ['Ausente', ausente],
        ]}
        cor={cor}
        className="mt-3"
      />
      <Legenda
        cor={cor}
        itens={[
          ['Presente', presente],
          ['Ausente', ausente],
        ]}
      />
    </div>
  )
}

// Físico-químicos: como os valores se distribuem. A metade central fica em tom cheio.
function Histograma({ n, cor }: { n: Numerico; cor: (valor: number) => string }) {
  const maior = Math.max(1, ...n.histograma)
  const largura = (n.ate - n.de) / n.histograma.length
  const posicao = (x: number) => (n.ate > n.de ? ((x - n.de) / (n.ate - n.de)) * 100 : 50)
  return (
    <div>
      <div
        role="img"
        aria-label={`Mediana ${decimal.format(n.mediana)}; metade dos valores entre ${decimal.format(n.q1)} e ${decimal.format(n.q3)}`}
        className="relative flex h-24 items-end gap-px border-b border-linha"
      >
        {n.histograma.map((qtd, i) => {
          const de = n.de + i * largura
          const centro = de + largura / 2
          return (
            <span
              key={i}
              title={`${decimal.format(de)} a ${decimal.format(de + largura)}: ${fmt(qtd)} análises`}
              className="flex-1"
              style={{
                height: qtd ? `max(2px, ${(qtd / maior) * 100}%)` : 0,
                background: cor(centro),
                opacity: centro >= n.q1 && centro <= n.q3 ? 1 : 0.4,
              }}
            />
          )
        })}
        <span
          aria-hidden
          className="absolute -bottom-1 h-[calc(100%+0.5rem)] w-0.5 bg-texto"
          style={{ left: `${posicao(n.mediana)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-texto-3">
        <span>{decimal.format(n.de)}</span>
        <span>{decimal.format(n.ate)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="rotulo text-texto-2">Mediana</dt>
          <dd className="font-display text-3xl leading-tight">{decimal.format(n.mediana)}</dd>
        </div>
        <div>
          <dt className="rotulo text-texto-2">Metade entre</dt>
          <dd className="font-display text-3xl leading-tight">
            {decimal.format(n.q1)} e {decimal.format(n.q3)}
          </dd>
        </div>
      </dl>
      {n.acima > 0 && (
        <p className="maquina mt-2 text-xs text-texto-3">
          {fmt(n.acima)} {n.acima === 1 ? 'valor ficou' : 'valores ficaram'} fora do gráfico, acima de{' '}
          {decimal.format(n.ate)} (máximo {decimal.format(n.maximo)}).
        </p>
      )}
    </div>
  )
}

// Análises por mês; com destaque, a parte em tom cheio é a que tem presença.
function Meses({
  cor,
  valores,
  destaque,
  rotuloDestaque,
}: {
  cor: string
  valores: number[]
  destaque?: number[]
  rotuloDestaque: string
}) {
  const maior = Math.max(1, ...valores)
  return (
    <div className="mt-auto pt-5">
      <div className="rotulo mb-2 text-texto-2">Por mês da coleta</div>
      <div className="flex h-10 items-end gap-1">
        {valores.map((qtd, i) => (
          <span
            key={i}
            title={`${MESES[i]}: ${fmt(qtd)} análises${destaque ? `, ${fmt(destaque[i])} ${rotuloDestaque}` : ''}`}
            className="relative flex-1 overflow-hidden bg-superficie-2"
            style={{ height: qtd ? `max(2px, ${(qtd / maior) * 100}%)` : '2px' }}
          >
            <span className="absolute inset-0" style={{ background: cor, opacity: destaque ? 0.3 : 0.75 }} />
            {destaque && destaque[i] > 0 && (
              <span
                className="absolute inset-x-0 bottom-0"
                style={{ height: `max(2px, ${(destaque[i] / qtd) * 100}%)`, background: cor }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center font-mono text-[10px] text-texto-3">
        {MESES.map((m) => (
          <span key={m} className="flex-1">
            {m.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

function Controle({ codigo, ano }: { codigo: string; ano: number }) {
  const { data, error, isPending } = useQuery(consultas.resumoControle(codigo, ano))
  if (isPending) return <Carregando texto="Calculando os gráficos…" />
  if (error) return <Falha erro={error} />
  if (!data.length) return <Aviso>Nenhum registro fora do padrão em {ano}.</Aviso>
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.map((p) => (
        <CartaoControle key={p.parametro} p={p} />
      ))}
    </div>
  )
}

function CartaoControle({ p }: { p: ParametroControle }) {
  const maior = Math.max(1, ...p.areas.map((a) => a.registros))
  const cor = corDoParametro(p.parametro, CONTROLE)
  return (
    <Cartao
      titulo={p.parametro}
      total={p.registros}
      unidade={p.registros === 1 ? 'registro' : 'registros'}
      amostra={ehPh(p.parametro) ? gradienteDoPh() : cor}
    >
      <div className="grid gap-4">
        <Divisao titulo="Zona" partes={p.zonas} cor={cor} unidade="registros" />
        <Divisao titulo="Ponto de monitoramento" partes={p.pontos} cor={cor} unidade="registros" />
        <div>
          <div className="rotulo mb-3 text-texto-2">Áreas com mais registros</div>
          <ul className="grid gap-2 text-sm">
            {p.areas.map((a) => (
              <li key={a.area}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{tituloNome(a.area)}</span>
                  <span className="font-semibold">{fmt(a.registros)}</span>
                </div>
                <Barra fracao={a.registros / maior} cor={cor} />
              </li>
            ))}
          </ul>
          {p.outras_areas > 0 && (
            <p className="maquina mt-2 text-xs text-texto-3">Mais {fmt(p.outras_areas)} em outras áreas.</p>
          )}
        </div>
      </div>
    </Cartao>
  )
}

// Um todo dividido em categorias: barra empilhada e legenda com as contagens.
function Divisao({
  titulo,
  partes,
  cor,
  unidade,
}: {
  titulo: string
  partes: Record<string, number>
  cor: Cor
  unidade: string
}) {
  const itens = Object.entries(partes)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, n]) => [nome.charAt(0) + nome.slice(1).toLowerCase(), n] as [string, number])
  const total = itens.reduce((t, [, n]) => t + n, 0)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="rotulo text-texto-2">{titulo}</span>
        {itens.length > 1 && (
          <span className="text-texto-3">
            {porcento.format(itens[0][1] / total)} {itens[0][0].toLowerCase()}
          </span>
        )}
      </div>
      <Empilhada itens={itens} cor={cor} unidade={unidade} />
      <Legenda cor={cor} itens={itens} />
    </div>
  )
}

function Empilhada({
  itens,
  cor,
  unidade = 'análises',
  className,
}: {
  itens: [string, number][]
  cor: Cor
  unidade?: string
  className?: string
}) {
  const total = itens.reduce((t, [, n]) => t + n, 0) || 1
  return (
    <div className={cn('flex h-3 gap-0.5 overflow-hidden', className)}>
      {itens.map(([nome, n], i) =>
        n ? (
          <span
            key={nome}
            title={`${nome}: ${fmt(n)} ${unidade}`}
            className="min-w-1"
            style={{ flexGrow: n / total, ...pintar(cor, nome, i) }}
          />
        ) : null,
      )}
    </div>
  )
}

function Legenda({ cor, itens }: { cor: Cor; itens: [string, number][] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-texto-2">
      {itens.map(([nome, n], i) => (
        <li key={nome} className="inline-flex items-center gap-1.5">
          <span className="size-2" style={pintar(cor, nome, i)} />
          {nome} <span className="font-semibold text-texto">{fmt(n)}</span>
        </li>
      ))}
    </ul>
  )
}

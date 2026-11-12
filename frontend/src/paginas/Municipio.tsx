import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { HeartPulse } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Desmatamento } from '../componentes/Desmatamento'
import { PainelFonte } from '../componentes/PainelFonte'
import { OPCOES_POLUENTE, QualidadeDoAr } from '../componentes/QualidadeDoAr'
import { ImpactoNaSaude } from '../componentes/ImpactoNaSaude'
import { Queimadas } from '../componentes/Queimadas'
import { RegistrosPorParametro } from '../componentes/RegistrosPorParametro'
import { type Coluna, ComUnidade, type Elemento, RetratoElementos } from '../componentes/RetratoElementos'
import { Carregando, Etiqueta, Faixa, Falha, Secao, Seletor, Trilha, cn } from '../componentes/ui'
import {
  type Desmatamento as DadosTerra,
  type Municipio as DadosMunicipio,
  type QualidadeDoAr as DadosAr,
  type Queimadas as DadosFogo,
  consultas,
} from '../lib/api'
import { corDoPoluente } from '../lib/cores'
import { fmt, fmtData, tituloNome } from '../lib/formato'
import { nomeUf, regiaoDaUf } from '../lib/lugares'

const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtMes = (mes: string) => MES_LONGO.format(new Date(`${mes}-01T00:00:00Z`))
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const ano = (mes: string) => mes.slice(0, 4)
// AAAA-MM de `meses` antes de `mes`, para contar "os últimos 12 meses".
const mesesAntes = (mes: string, meses: number) => {
  const d = new Date(`${mes}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 7)
}
// No DF, o SISAM e o INPE só têm o Distrito Federal inteiro, não cada RA.
const DO_DF = 'valor do Distrito Federal inteiro'

// Cada elemento: a cor que o dado usa nos gráficos e a fonte.
const ELEMENTOS = {
  agua: { nome: 'Água', cor: 'var(--color-vigilancia)', fonte: 'SISAGUA' },
  ar: { nome: 'Ar', cor: corDoPoluente('pm25'), fonte: 'SISAM/INPE' },
  terra: { nome: 'Terra', cor: 'var(--mata)', fonte: 'MapBiomas Alerta' },
  fogo: { nome: 'Fogo', cor: 'var(--fogo-3)', fonte: 'INPE' },
} as const

type ChaveElemento = keyof typeof ELEMENTOS
// "saude" não é um elemento: é a leitura do ar e da fumaça pelo lado da saúde.
type Aba = ChaveElemento | 'saude'

// O resumo de cada elemento responde "como está aqui agora": o ano ou os 12
// meses mais recentes, com o total e o pior momento como contexto.
function colunaAgua(m: DadosMunicipio): Coluna | null {
  const vig = m.vigilancia?.por_ano ?? []
  const ctl = m.controle_fora_do_padrao?.por_ano ?? []
  if (!vig.length && !ctl.length) return null
  const ultimo = Math.max(...[...vig, ...ctl].map((a) => a.ano))
  const analises = vig.find((a) => a.ano === ultimo)?.analises ?? 0
  const fora = ctl.find((a) => a.ano === ultimo)?.registros
  return {
    destaque: fmt(analises),
    legenda: `análises da vigilância em ${ultimo}`,
    contexto: [
      fora != null ? `${fmt(fora)} registros fora do padrão no mesmo ano` : 'nenhum registro fora do padrão no ano',
      m.vigilancia?.ultima_coleta && `última coleta em ${fmtData(m.vigilancia.ultima_coleta)}`,
    ],
  }
}

function colunaAr(dados: DadosAr): Coluna | null {
  const p = dados.poluentes.find((x) => x.poluente === 'pm25')
  if (!p?.por_mes.length) return null
  const ultimos = p.por_mes.slice(-12)
  // Média dos dias, não dos meses: um mês incompleto pesa menos.
  const dias = ultimos.reduce((t, m) => t + m.dias, 0)
  const media = ultimos.reduce((t, m) => t + m.media * m.dias, 0) / dias
  return {
    destaque: <ComUnidade valor={decimal.format(media)} unidade={p.unidade} />,
    legenda: 'de material particulado fino (MP2,5), em média, nos últimos 12 meses',
    contexto: [
      `o maior valor num só dia foi ${decimal.format(p.maximo.valor)} ${p.unidade}, em ${fmtData(p.maximo.data)}`,
      dados.distrito_federal && DO_DF,
    ],
  }
}

function colunaTerra(dados: DadosTerra): Coluna {
  return {
    destaque: <ComUnidade valor={fmt(Math.round(dados.area_ha))} unidade="ha" />,
    legenda: 'desmatados em alertas validados',
    contexto: [
      `${fmt(dados.alertas)} ${dados.alertas === 1 ? 'alerta' : 'alertas'}, de ${ano(dados.inicio)} a ${ano(dados.fim)}`,
      dados.maior && `o maior foi detectado em ${fmtData(dados.maior.data)}`,
      dados.distrito_federal && DO_DF,
    ],
  }
}

function colunaFogo(dados: DadosFogo): Coluna {
  const desde = mesesAntes(dados.fim, 11)
  const recentes = dados.por_mes.filter((m) => m.mes >= desde).reduce((t, m) => t + m.focos, 0)
  return {
    destaque: fmt(recentes),
    legenda: 'focos de queimadas nos últimos 12 meses',
    contexto: [
      `${fmt(dados.total)} desde ${ano(dados.inicio)}`,
      dados.pior_mes && `o mês com mais focos foi ${fmtMes(dados.pior_mes.mes)}, com ${fmt(dados.pior_mes.focos)}`,
      dados.distrito_federal && DO_DF,
    ],
  }
}

function elemento<T>(
  base: (typeof ELEMENTOS)[keyof typeof ELEMENTOS],
  consulta: UseQueryResult<T>,
  coluna: (dados: T) => Coluna | null,
): Elemento {
  return {
    ...base,
    coluna: consulta.data ? coluna(consulta.data) : null,
    carregando: consulta.isPending,
    // Fonte não baixada volta 404 ("... não carregados"): é "sem dados", não falha.
    erro: consulta.isError && !/não carregad/.test(consulta.error.message),
  }
}

// Abas dos elementos: a escolhida troca o conteúdo logo abaixo, no lugar do
// anterior. A barra fica presa no topo ao rolar, para trocar de qualquer ponto.
function AbasElementos({ atual, onEscolher }: { atual: Aba; onEscolher: (aba: Aba) => void }) {
  // O mesmo grão do papel por cima do fundo, para a barra não destoar da página.
  return (
    <div className="sticky top-16 z-20 border-b border-linha [background:var(--grao),var(--fundo)]">
      <div
        role="tablist"
        aria-label="Elementos"
        className="mx-auto flex max-w-7xl items-center gap-0.5 overflow-x-auto px-4 sm:gap-1 md:gap-2 md:px-6"
      >
        {(Object.keys(ELEMENTOS) as ChaveElemento[]).map((chave) => {
          const e = ELEMENTOS[chave]
          const ativa = atual === chave
          return (
            <button
              key={chave}
              type="button"
              role="tab"
              id={`aba-${chave}`}
              aria-selected={ativa}
              aria-controls="painel-elemento"
              onClick={() => onEscolher(chave)}
              className={cn(
                'manchete flex shrink-0 items-center gap-2 border-b-4 px-2 py-3 text-lg transition sm:gap-2.5 sm:px-3 sm:text-xl md:px-4 md:text-2xl',
                ativa ? 'text-texto' : 'border-transparent text-texto-3 hover:text-texto',
              )}
              style={ativa ? { borderColor: e.cor } : undefined}
            >
              <span aria-hidden className="size-2.5" style={{ background: e.cor }} />
              {e.nome}
            </button>
          )
        })}
        {/* Separada dos elementos e de outro feitio: atravessa o ar e o fogo. */}
        <button
          type="button"
          role="tab"
          id="aba-saude"
          aria-selected={atual === 'saude'}
          aria-controls="painel-elemento"
          onClick={() => onEscolher('saude')}
          className={cn(
            'rotulo ml-auto flex shrink-0 items-center gap-2 border-2 px-2.5 py-2 transition sm:px-4 sm:py-2.5',
            atual === 'saude' ? 'border-texto bg-texto text-fundo' : 'border-linha text-texto-2 hover:border-texto hover:text-texto',
          )}
        >
          <HeartPulse aria-hidden className="size-4" />
          {/* No celular o nome curto, para caber na mesma linha das abas. */}
          <span className="sm:hidden">Saúde</span>
          <span className="hidden sm:inline">Impacto na saúde</span>
        </button>
      </div>
    </div>
  )
}

export function Municipio() {
  const { codigo } = useParams({ from: '/municipio/$codigo' })
  const { data: m, error, isPending } = useQuery(consultas.municipio(codigo))
  const ar = useQuery(consultas.qualidadeDoAr(codigo))
  const terra = useQuery(consultas.desmatamento(codigo))
  const fogo = useQuery(consultas.queimadas(codigo))
  const [poluente, setPoluente] = useState('pm25')
  const [aba, setAba] = useState<Aba>('agua')
  const painel = useRef<HTMLDivElement>(null)

  // Trocar de elemento já rolado para baixo volta só até o começo do novo
  // conteúdo, logo abaixo das abas, para ele não abrir pela metade. 128 px é o
  // cabeçalho mais as abas presas (o mesmo scroll-mt-32 do painel).
  const escolher = (proxima: Aba) => {
    setAba(proxima)
    const topo = painel.current?.getBoundingClientRect().top
    if (topo != null && topo < 128) painel.current?.scrollIntoView()
  }

  useEffect(() => {
    if (m) document.title = `${tituloNome(m.municipio)} (${m.uf}) · Elementar`
  }, [m])

  if (isPending)
    return (
      <Faixa>
        <Carregando texto="Carregando município…" />
      </Faixa>
    )
  if (error)
    return (
      <Faixa>
        <Falha erro={error} />
      </Faixa>
    )

  const nome = tituloNome(m.municipio)
  const regiao = regiaoDaUf(m.uf)
  const vig = m.vigilancia
  const ctl = m.controle_fora_do_padrao
  const poluentes = ar.data?.poluentes ?? []

  return (
    <>
      <Faixa interno="py-10 md:py-14">
        <Trilha>
          <Link to="/" className="hover:text-texto">
            Brasil
          </Link>
          <span>/</span>
          <Link to="/uf/$uf" params={{ uf: m.uf }} className="hover:text-texto">
            {nomeUf(m.uf)}
          </Link>
          <span>/</span>
          <span className="text-texto">{nome}</span>
        </Trilha>

        <div className="mt-10 grid items-end gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <h1 className="manchete text-6xl sm:text-7xl md:text-8xl lg:text-9xl">
              {nome}
              <span className="text-sul">.</span>
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link to="/uf/$uf" params={{ uf: m.uf }}>
                <Etiqueta cor={regiao.cor}>{nomeUf(m.uf)}</Etiqueta>
              </Link>
              <Etiqueta>Região {regiao.nome}</Etiqueta>
            </div>
          </div>
          <div
            className="relative hidden size-48 rotate-[-4deg] place-items-center border-[3px] lg:grid"
            style={{
              borderColor: regiao.cor,
              backgroundImage: `radial-gradient(${regiao.cor} 1.6px, transparent 2px)`,
              backgroundSize: '9px 9px',
            }}
          >
            <span className="manchete bg-fundo px-3 pt-1 text-6xl">{m.uf}</span>
          </div>
        </div>
      </Faixa>

      <Faixa tom="tinta" rasgada interno="py-12 md:py-16">
        <RetratoElementos
          elementos={[
            { ...ELEMENTOS.agua, coluna: colunaAgua(m) },
            elemento(ELEMENTOS.ar, ar, colunaAr),
            elemento(ELEMENTOS.terra, terra, colunaTerra),
            elemento(ELEMENTOS.fogo, fogo, colunaFogo),
          ]}
        />
      </Faixa>

      <AbasElementos atual={aba} onEscolher={escolher} />

      <div ref={painel} id="painel-elemento" role="tabpanel" aria-labelledby={`aba-${aba}`} className="scroll-mt-32">
        {aba === 'agua' && (
          <Secao
            titulo="Água."
            descricao="Análises das secretarias de saúde (vigilância) e amostras fora do padrão informadas pelos prestadores do serviço (controle)."
          >
            <div className="grid min-w-0 gap-6 md:grid-cols-2">
              <PainelFonte
                key={`vig-${m.codigo_ibge}`}
                titulo="Vigilância"
                descricao="Análises por ano, parâmetros básicos."
                cor="var(--color-vigilancia)"
                porAno={vig?.por_ano ?? null}
                valor={(a) => a.analises}
                unidade="análises"
              />
              <PainelFonte
                key={`ctl-${m.codigo_ibge}`}
                titulo="Controle fora do padrão"
                descricao="Registros por ano."
                cor="var(--color-controle)"
                porAno={ctl?.por_ano ?? null}
                valor={(a) => a.registros}
                unidade="registros"
              />
            </div>
            <h3 className="manchete mt-14 mb-6 text-3xl">Parâmetro por parâmetro</h3>
            <RegistrosPorParametro key={m.codigo_ibge} municipio={m} />
          </Secao>
        )}

        {aba === 'ar' && (
          <Secao
            titulo="Ar."
            acao={
              poluentes.length > 0 && (
                <Seletor
                  rotulo="Poluente"
                  valor={poluente}
                  onMudar={setPoluente}
                  opcoes={OPCOES_POLUENTE.filter((o) => poluentes.some((p) => p.poluente === o.valor))}
                />
              )
            }
          >
            <QualidadeDoAr consulta={ar} poluente={poluente} />
          </Secao>
        )}

        {aba === 'terra' && (
          <Secao titulo="Terra.">
            <Desmatamento consulta={terra} />
          </Secao>
        )}

        {aba === 'fogo' && (
          <Secao titulo="Fogo.">
            <Queimadas consulta={fogo} />
          </Secao>
        )}

        {aba === 'saude' && (
          <Secao
            titulo="Impacto na saúde."
            descricao="O ar poluído entra pela respiração e afeta do nariz ao coração. A fumaça das queimadas é uma das principais causas."
          >
            <ImpactoNaSaude ar={ar} fogo={fogo} />
          </Secao>
        )}
      </div>
    </>
  )
}

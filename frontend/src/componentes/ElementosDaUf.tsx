import { useQuery } from '@tanstack/react-query'
import { type ResumoDaUf, consultas } from '../lib/api'
import { corDoPoluente } from '../lib/cores'
import { fmt, fmtData, tituloNome } from '../lib/formato'
import { type Coluna, ComUnidade, RetratoElementos } from './RetratoElementos'

const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtMes = (mes: string) => MES_LONGO.format(new Date(`${mes}-01T00:00:00Z`))
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const ano = (mes: string) => mes.slice(0, 4)

// Os quatro elementos, na ordem da página inicial. Para trazer uma informação
// nova, some um campo ao bloco do elemento em /estados/{uf}/resumo e uma linha
// em `contexto`; um elemento sem dados carregados vira null e a coluna avisa.
const ELEMENTOS: { nome: string; cor: string; fonte: string; coluna: (r: ResumoDaUf) => Coluna | null }[] = [
  {
    nome: 'Água',
    cor: 'var(--color-vigilancia)',
    fonte: 'SISAGUA',
    coluna: ({ agua: a }) =>
      a.de == null
        ? null
        : {
            destaque: fmt(a.analises),
            legenda: 'análises da vigilância',
            contexto: [
              `${fmt(a.registros_fora_do_padrao)} registros fora do padrão, em ${fmt(a.municipios_com_registros)} municípios`,
              `${fmt(a.municipios_com_analises)} municípios com análises, de ${a.de} a ${a.ate}`,
            ],
          },
  },
  {
    nome: 'Ar',
    cor: corDoPoluente('pm25'),
    fonte: 'SISAM/INPE',
    coluna: ({ ar }) =>
      ar && {
        destaque: <ComUnidade valor={decimal.format(ar.valor)} unidade={ar.unidade} />,
        legenda: 'o maior valor de material particulado fino (MP2,5) num só dia',
        contexto: [`em ${tituloNome(ar.municipio)}, ${fmtData(ar.data)}`],
      },
  },
  {
    nome: 'Terra',
    cor: 'var(--mata)',
    fonte: 'MapBiomas Alerta',
    coluna: ({ terra: t }) =>
      t && {
        destaque: <ComUnidade valor={fmt(Math.round(t.area_ha))} unidade="ha" />,
        legenda: 'desmatados em alertas validados',
        contexto: [`${fmt(t.alertas)} ${t.alertas === 1 ? 'alerta' : 'alertas'}, de ${ano(t.inicio)} a ${ano(t.fim)}`],
      },
  },
  {
    nome: 'Fogo',
    cor: 'var(--fogo-3)',
    fonte: 'INPE',
    coluna: ({ fogo: f }) =>
      f && {
        destaque: fmt(f.focos),
        legenda: 'focos de queimadas',
        contexto: [
          `de ${ano(f.inicio)} a ${ano(f.fim)}`,
          f.pior_mes != null && `o mês com mais focos foi ${fmtMes(f.pior_mes.mes)}, com ${fmt(f.pior_mes.focos)}`,
        ],
      },
  },
]

// Resumo da UF: uma coluna por elemento, somando os municípios do estado.
export function ElementosDaUf({ uf }: { uf: string }) {
  const { data, isPending, isError } = useQuery(consultas.resumoUf(uf))
  return (
    <RetratoElementos
      elementos={ELEMENTOS.map((e) => ({
        nome: e.nome,
        cor: e.cor,
        fonte: e.fonte,
        coluna: data ? e.coluna(data) : null,
        carregando: isPending,
        erro: isError,
      }))}
    />
  )
}

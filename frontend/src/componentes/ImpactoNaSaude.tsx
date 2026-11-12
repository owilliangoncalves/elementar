import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { QualidadeDoAr, Queimadas } from '../lib/api'
import { corDoPoluente } from '../lib/cores'
import { fmt } from '../lib/formato'
import { ComUnidade } from './RetratoElementos'

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const vezes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

// Diretrizes Globais de Qualidade do Ar da OMS (2021) para o MP2,5, em µg/m³.
const OMS_MP25_ANUAL = 5
const OMS_MP25_DIARIO = 15

// AAAA-MM de `meses` antes de `mes`.
const mesesAntes = (mes: string, meses: number) => {
  const d = new Date(`${mes}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 7)
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <h3 className="manchete text-2xl">{titulo}</h3>
      <ul className="maquina mt-4 space-y-2 text-texto-2">
        {itens.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 bg-texto-3" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// O que a poluição do ar e a fumaça das queimadas significam para a saúde,
// começando pelo que os dados dizem sobre este município. Conteúdo orientativo,
// reescrito a partir do SISAM (INPE) e do Vigiar (Ministério da Saúde).
export function ImpactoNaSaude({ ar, fogo }: { ar: UseQueryResult<QualidadeDoAr>; fogo: UseQueryResult<Queimadas> }) {
  const pm25 = ar.data?.poluentes.find((p) => p.poluente === 'pm25')
  const ultimos = pm25?.por_mes.slice(-12) ?? []
  const dias = ultimos.reduce((t, m) => t + m.dias, 0)
  const media = dias ? ultimos.reduce((t, m) => t + m.media * m.dias, 0) / dias : null
  // Meses em que até a média passou do limite diário da OMS: muitos dias acima dele.
  const mesesAcima = ultimos.filter((m) => m.media > OMS_MP25_DIARIO).length

  const focos =
    fogo.data &&
    fogo.data.por_mes.filter((m) => m.mes >= mesesAntes(fogo.data.fim, 11)).reduce((t, m) => t + m.focos, 0)

  return (
    <div className="space-y-16">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="ficha p-6">
          <h3 className="manchete flex items-center gap-2 text-2xl">
            <span aria-hidden className="size-3" style={{ background: corDoPoluente('pm25') }} />
            O ar aqui
          </h3>
          {media != null && pm25 ? (
            <>
              <p className="mt-4 font-display text-6xl leading-none">
                <ComUnidade valor={decimal.format(media)} unidade={pm25.unidade} />
              </p>
              <p className="maquina mt-3 text-texto">
                de material particulado fino (MP2,5), em média, nos últimos 12 meses
              </p>
              <ul className="maquina mt-4 space-y-1.5 text-sm text-texto-2">
                <li>
                  A OMS recomenda até {OMS_MP25_ANUAL} {pm25.unidade} na média do ano
                  {media > OMS_MP25_ANUAL && `: aqui, ${vezes.format(media / OMS_MP25_ANUAL)} vezes isso`}.
                </li>
                {mesesAcima > 0 && (
                  <li>
                    {mesesAcima === ultimos.length
                      ? `Em todos os últimos ${ultimos.length} meses`
                      : `Em ${mesesAcima} dos últimos ${ultimos.length} meses`}
                    , até a média passou de {OMS_MP25_DIARIO} {pm25.unidade}, o limite da OMS para um só dia.
                  </li>
                )}
                {ar.data?.distrito_federal && <li>Valor do Distrito Federal inteiro.</li>}
              </ul>
            </>
          ) : (
            <p className="maquina mt-4 text-texto-3">
              {ar.isPending ? 'Carregando…' : 'Sem estimativas de qualidade do ar para este município.'}
            </p>
          )}
        </section>

        <section className="ficha p-6">
          <h3 className="manchete flex items-center gap-2 text-2xl">
            <span aria-hidden className="size-3" style={{ background: 'var(--fogo-3)' }} />
            A fumaça aqui
          </h3>
          {focos != null ? (
            <>
              <p className="mt-4 font-display text-6xl leading-none">{fmt(focos)}</p>
              <p className="maquina mt-3 text-texto">focos de queimadas nos últimos 12 meses</p>
              <p className="maquina mt-4 text-sm text-texto-2">
                A fumaça das queimadas é uma das principais fontes de material particulado fino, e viaja: pode piorar
                o ar mesmo onde não há fogo por perto.
              </p>
            </>
          ) : (
            <p className="maquina mt-4 text-texto-3">
              {fogo.isPending ? 'Carregando…' : 'Sem dados de focos de queimadas para este município.'}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-12 md:grid-cols-2">
        <Lista
          titulo="Logo depois de respirar ar poluído"
          itens={[
            'Ardência nos olhos, no nariz e na garganta',
            'Tosse, chiado no peito e dor de cabeça',
            'Crises de asma, bronquite e rinite',
            'Mais infecções respiratórias',
          ]}
        />
        <Lista
          titulo="Depois de anos de exposição"
          itens={[
            'Doença pulmonar obstrutiva crônica (DPOC)',
            'Doenças do coração e AVC',
            'Câncer de pulmão',
            'Complicações na gravidez e no desenvolvimento das crianças',
          ]}
        />
        <Lista
          titulo="Quem sente mais"
          itens={[
            'Crianças e idosos',
            'Gestantes',
            'Quem tem doença respiratória ou do coração',
            'Quem vive em condições ambientais e sociais mais difíceis',
          ]}
        />
        <Lista
          titulo="Como se proteger em dias de ar ruim ou fumaça"
          itens={[
            'Evite exercícios ao ar livre nos horários mais poluídos',
            'Fique em ambientes fechados, com portas e janelas fechadas',
            'Beba mais água',
            'Redobre o cuidado com crianças, idosos e gestantes',
            'Procure atendimento se tiver sintomas, e acompanhe os alertas oficiais',
          ]}
        />
      </div>

      <p className="border-t border-linha pt-6 text-sm text-texto-3">
        Conteúdo orientativo, que não substitui avaliação médica.{' '}
        <Link to="/sobre" className="underline decoration-1 underline-offset-4 hover:text-texto">
          Fontes e limitações em Sobre os dados
        </Link>
        .
      </p>
    </div>
  )
}

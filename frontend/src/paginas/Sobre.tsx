import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Faixa, Recorte } from '../componentes/ui'
import { consultas } from '../lib/api'
import { corDoPoluente } from '../lib/cores'

// Um elemento por fonte oficial, com a cor que o elemento usa no resto do site.
const ELEMENTOS = [
  {
    nome: 'Água',
    cor: 'var(--color-vigilancia)',
    fonte: 'SISAGUA, Ministério da Saúde (OpenDataSUS)',
    texto: [
      'Vigilância: análises dos parâmetros básicos feitas pelas secretarias de saúde em amostras coletadas no município.',
      'Controle mensal: registros dos prestadores do abastecimento quando uma amostra não atende ao padrão.',
    ],
  },
  {
    nome: 'Ar',
    cor: corDoPoluente('pm25'),
    fonte: 'SISAM, INPE',
    texto: [
      'Estimativas diárias de seis poluentes (MP2,5, MP10, ozônio, dióxido de nitrogênio, dióxido de enxofre e monóxido de carbono), desde 2014.',
      'São calculadas por modelo atmosférico, não medidas em estações. Os dias mais recentes vêm da previsão, até a reanálise cobri-los.',
    ],
  },
  {
    nome: 'Terra',
    cor: 'var(--mata)',
    fonte: 'MapBiomas Alerta',
    link: 'https://plataforma.alerta.mapbiomas.org',
    texto: [
      'Alertas de desmatamento validados, confirmados com imagens de satélite de antes e depois, desde 2019.',
      'Cada alerta conta pela data de detecção e só pela área dentro do município. Licença CC BY 4.0.',
    ],
  },
  {
    nome: 'Fogo',
    cor: 'var(--fogo-3)',
    fonte: 'Programa Queimadas, INPE',
    texto: [
      'Focos de fogo ativo do satélite de referência (AQUA, na passagem da tarde), desde 2014.',
      'Cada foco é um ponto de cerca de 1 km com fogo no momento da passagem: não é o número de incêndios nem a área queimada.',
    ],
  },
]

// Fontes da seção de impacto na saúde, na página de cada município.
const FONTES_SAUDE = [
  { nome: 'INPE: SISAM, saúde ambiental', url: 'https://data.inpe.br/queimadas/sisam/saude_ambiental' },
  { nome: 'Ministério da Saúde: Vigiar', url: 'https://www.gov.br/saude/pt-br/composicao/svsa/saude-ambiental/vigiar' },
  {
    nome: 'Ministério da Saúde: queimadas e incêndios florestais, recomendações à população',
    url: 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/vigilancia-ambiental/queimadas-e-incencios-florestais-2a-edicao.pdf',
  },
]

export function Sobre() {
  useQuery(consultas.atualizacao())

  useEffect(() => {
    document.title = 'Sobre os dados · Elementar'
  }, [])

  return (
    <>
      <Faixa interno="grid gap-10 py-12 md:py-16 lg:grid-cols-[7fr_5fr] lg:items-end">
        <div>
          <h1 className="manchete text-6xl md:text-8xl">
            Sobre
            <br />
            os <Recorte marca>dados.</Recorte>
          </h1>
        </div>
        <p className="papel text-[15px] leading-relaxed">
          O Elementar reúne, município por município, dados públicos de quatro fontes oficiais: uma para cada elemento.
          Os números aparecem como as fontes publicam, sem ajustes.
        </p>
      </Faixa>

      <Faixa tom="tinta" rasgada interno="py-14 md:py-20">
        <ul className="grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-4 xl:gap-x-0 xl:colunas-fio">
          {ELEMENTOS.map((e) => (
            <li
              key={e.nome}
              className="border-t-4 pt-5 xl:px-8 xl:first:pl-0 xl:last:pr-0"
              style={{ borderColor: e.cor }}
            >
              <h2 className="manchete text-4xl">{e.nome}</h2>
              <p className="mt-2 text-sm font-semibold text-texto">
                {e.link ? (
                  <a href={e.link} target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-4">
                    {e.fonte}
                  </a>
                ) : (
                  e.fonte
                )}
              </p>
              <div className="maquina mt-4 space-y-3 text-texto-2">
                {e.texto.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Faixa>

      <Faixa interno="grid gap-10 py-14 md:py-20 lg:grid-cols-[5fr_7fr]">
        <div className="border-l-2 border-sul pl-5 md:pl-8">
          <h2 className="manchete text-5xl md:text-7xl">
            Como <span className="text-sul">ler.</span>
          </h2>
        </div>
        <div className="maquina space-y-5 text-lg leading-relaxed text-texto-2">
          <p>
            Contagens brutas, sem ajuste por população. Quando uma fonte não tem dados do município, mostramos “sem
            dados”, nunca zero.
          </p>
          <p>Na água, mais análises indicam mais monitoramento, não necessariamente água pior.</p>
          <p>
            No Distrito Federal, o SISAGUA separa as Regiões Administrativas; ar, terra e fogo vêm do Distrito Federal
            inteiro, porque as outras fontes não fazem essa divisão.
          </p>
          <p>As cores do mapa só identificam as regiões do IBGE. As malhas dos estados e municípios também são do IBGE.</p>
        </div>
      </Faixa>

      <Faixa tom="papel-2" interno="grid gap-10 py-14 md:py-20 lg:grid-cols-[5fr_7fr]">
        <div className="border-l-2 border-sul pl-5 md:pl-8">
          <h2 id="saude" className="manchete text-5xl md:text-7xl">
            Impacto na <span className="text-sul">saúde.</span>
          </h2>
        </div>
        <div className="maquina space-y-5 text-lg leading-relaxed text-texto-2">
          <p>
            Por enquanto, a seção de saúde de cada município trata do ar e da fumaça das queimadas. O conteúdo é
            orientativo e não substitui avaliação médica.
          </p>
          <p>
            As estimativas do SISAM vêm de modelo atmosférico, não de estações de medição. A comparação usa as
            Diretrizes Globais de Qualidade do Ar da OMS (2021): 5 µg/m³ de MP2,5 na média do ano e 15 µg/m³ em 24 horas.
          </p>
          <ul className="space-y-2 font-sans text-base">
            {FONTES_SAUDE.map((f) => (
              <li key={f.url}>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-texto underline decoration-1 underline-offset-4 hover:text-sul"
                >
                  {f.nome}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Faixa>
    </>
  )
}

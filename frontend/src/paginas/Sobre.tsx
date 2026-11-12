import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Faixa, Recorte } from '../componentes/ui'
import { consultas } from '../lib/api'

const FONTES = [
  {
    nome: 'Vigilância',
    resumo: 'Parâmetros básicos',
    texto: 'Análises feitas pelas secretarias de saúde em amostras coletadas no município.',
    cor: 'var(--color-vigilancia)',
  },
  {
    nome: 'Controle mensal',
    resumo: 'Amostras fora do padrão',
    texto: 'Registros informados pelos prestadores de abastecimento quando uma amostra não atende ao padrão.',
    cor: 'var(--color-controle)',
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
          Os dados vêm do SISAGUA, o Sistema de Informação de Vigilância da Qualidade da Água para Consumo Humano,
          publicado pelo Ministério da Saúde no OpenDataSUS.
        </p>
      </Faixa>

      <Faixa tom="tinta" rasgada interno="py-14 md:py-20">
        <ol className=" grid gap-10 md:grid-cols-2 md:colunas-fio">
          {FONTES.map((f, i) => (
            <li key={f.nome} className="md:px-10 md:first:pl-0">
              <span className="font-display text-6xl leading-none" style={{ color: f.cor }}>
                0{i + 1}
              </span>
              <h2 className="manchete mt-4 text-4xl">{f.nome}</h2>
              <div className="rotulo mt-2 text-texto-2">{f.resumo}</div>
              <p className="maquina mt-4 max-w-md text-texto-2">{f.texto}</p>
            </li>
          ))}
        </ol>
      </Faixa>

      <Faixa interno="grid gap-10 py-14 md:py-20 lg:grid-cols-[5fr_7fr]">
        <div className="border-l-2 border-sul pl-5 md:pl-8">
          <h2 className="manchete text-5xl md:text-7xl">
            Como <span className="text-sul">ler.</span>
          </h2>
        </div>
        <div className="maquina space-y-5 text-lg leading-relaxed text-texto-2">
          <p>
            Mais análises indicam mais monitoramento, não necessariamente água pior. Quando uma fonte não tem dados do
            município, mostramos “sem dados”, nunca zero.
          </p>
          <p>As cores do mapa só identificam as regiões do IBGE. As malhas dos estados e municípios também são do IBGE.</p>
        </div>
      </Faixa>
    </>
  )
}

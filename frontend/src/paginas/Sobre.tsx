import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { consultas } from '../lib/api'

export function Sobre() {
  useQuery(consultas.atualizacao())

  useEffect(() => {
    document.title = 'Sobre os dados · Elementar'
  }, [])

  return (
    <div className="py-8">
      <h1 className="font-display text-5xl font-bold uppercase">Sobre os dados</h1>
      <div className="mt-6 max-w-2xl space-y-4 text-texto-2">
        <p>
          Os dados vêm do <strong className="text-texto">SISAGUA</strong>, o Sistema de Informação de Vigilância da
          Qualidade da Água para Consumo Humano, publicado pelo Ministério da Saúde no OpenDataSUS.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-texto">Vigilância: parâmetros básicos.</strong> Análises feitas pelas secretarias
            de saúde em amostras coletadas no município.
          </li>
          <li>
            <strong className="text-texto">Controle mensal: amostras fora do padrão.</strong> Registros informados
            pelos prestadores de abastecimento quando uma amostra não atende ao padrão.
          </li>
        </ul>
        <h2 className="pt-4 text-lg font-bold text-texto">Como ler</h2>
        <p>
          Mais análises indicam mais monitoramento, não necessariamente água pior. Quando uma fonte não tem dados do município, mostramos “sem dados”, nunca zero.
        </p>
        <p>As cores do mapa só identificam as regiões do IBGE. As malhas dos estados e municípios também são do IBGE.</p>
      </div>

    </div>
  )
}

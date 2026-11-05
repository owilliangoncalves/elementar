import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { MapaUf, type Metrica } from '../componentes/MapaUf'
import { TabelaRanking } from '../componentes/TabelaRanking'
import { Carregando, Etiqueta, Falha, Numero, Secao, Seletor } from '../componentes/ui'
import { consultas } from '../lib/api'
import { fmt } from '../lib/formato'
import { nomeUf, regiaoDaUf } from '../lib/lugares'

const METRICAS: { chave: Metrica; rotulo: string }[] = [
  { chave: 'vigilancia_analises', rotulo: 'Mapa: análises da vigilância' },
  { chave: 'controle_fora_do_padrao_registros', rotulo: 'Mapa: registros fora do padrão' },
]

export function Estado() {
  const uf = useParams({ from: '/uf/$uf' }).uf.toUpperCase()
  const navegar = useNavigate()
  const [metrica, setMetrica] = useState<Metrica>('vigilancia_analises')
  const { data: municipios, error, isPending } = useQuery(consultas.municipiosDaUf(uf))
  const regiao = regiaoDaUf(uf)

  useEffect(() => {
    document.title = `${nomeUf(uf)} · Elementar`
  }, [uf])

  if (isPending) return <Carregando texto={`Carregando ${nomeUf(uf)}…`} />
  if (error) return <Falha erro={error} />

  const soma = (chave: Metrica) => municipios.reduce((t, m) => t + (m[chave] ?? 0), 0)
  const conta = (chave: Metrica) => municipios.filter((m) => m[chave] != null).length

  return (
    <>
      <nav className="mt-8 mb-6 flex items-center gap-2 text-sm font-bold">
        <Link to="/" className="text-texto-2 hover:text-texto">
          Brasil
        </Link>
        <span className="text-texto-3">/</span>
        <span className="text-texto-2">{regiao.nome}</span>
        <span className="text-texto-3">/</span>
        {nomeUf(uf)}
      </nav>

      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <span className="font-display text-8xl leading-[0.8] font-bold" style={{ color: regiao.cor }}>
          {uf}
        </span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{nomeUf(uf)}</h1>
          <div className="mt-2">
            <Etiqueta>{fmt(municipios.length)} municípios com dados</Etiqueta>
          </div>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <Seletor
            rotulo="Colorir o mapa por"
            valor={metrica}
            onMudar={(v) => setMetrica(v as Metrica)}
            opcoes={METRICAS.map((m) => ({ valor: m.chave, rotulo: m.rotulo }))}
          />
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <MapaUf
          key={uf}
          uf={uf}
          municipios={municipios}
          metrica={metrica}
          // Mesma cor da região no mapa do Brasil: o estado não muda de cor ao abrir.
          cor={regiao.cor}
          onMunicipio={(codigo) => void navegar({ to: '/municipio/$codigo', params: { codigo } })}
        />
        <aside>
          <div className="border-b-2 border-texto pb-2 font-bold">Em números</div>
          <Numero
            rotulo="Análises da vigilância"
            valor={fmt(soma('vigilancia_analises'))}
            cor="var(--color-vigilancia)"
            nota={`${fmt(conta('vigilancia_analises'))} municípios com análises`}
          />
          <Numero
            rotulo="Registros fora do padrão"
            valor={fmt(soma('controle_fora_do_padrao_registros'))}
            cor="var(--color-controle)"
            nota={`${fmt(conta('controle_fora_do_padrao_registros'))} municípios com registros`}
          />
          <p className="mt-4 text-sm text-texto-2">
            Contagens brutas, sem ajuste por população. Mais análises indicam mais monitoramento, não necessariamente água
            pior.
          </p>
        </aside>
      </div>

      <Secao className="mt-12" titulo="Ranking dos municípios" descricao="Contagens brutas por município. Escolha como ordenar e toque num nome para ver os detalhes.">
        <TabelaRanking municipios={municipios} />
      </Secao>
    </>
  )
}

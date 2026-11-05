import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PainelFonte } from '../componentes/PainelFonte'
import { RegistrosPorParametro } from '../componentes/RegistrosPorParametro'
import { Carregando, Etiqueta, Falha, Numero, Secao } from '../componentes/ui'
import { consultas } from '../lib/api'
import { fmt, fmtData, tituloNome } from '../lib/formato'
import { nomeUf, regiaoDaUf } from '../lib/lugares'

export function Municipio() {
  const { codigo } = useParams({ from: '/municipio/$codigo' })
  const { data: m, error, isPending } = useQuery(consultas.municipio(codigo))

  useEffect(() => {
    if (m) document.title = `${tituloNome(m.municipio)} (${m.uf}) · Elementar`
  }, [m])

  if (isPending) return <Carregando texto="Carregando município…" />
  if (error) return <Falha erro={error} />

  const nome = tituloNome(m.municipio)
  const regiao = regiaoDaUf(m.uf)
  const vig = m.vigilancia
  const ctl = m.controle_fora_do_padrao
  const anos = new Set([...(vig?.por_ano ?? []), ...(ctl?.por_ano ?? [])].map((a) => a.ano))

  return (
    <>
      <nav className="mt-8 mb-6 flex flex-wrap items-center gap-2 text-sm font-bold">
        <Link to="/" className="text-texto-2 hover:text-texto">
          Brasil
        </Link>
        <span className="text-texto-3">/</span>
        <Link to="/uf/$uf" params={{ uf: m.uf }} className="text-texto-2 hover:text-texto">
          {nomeUf(m.uf)}
        </Link>
        <span className="text-texto-3">/</span>
        {nome}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <header className="flex items-start gap-5">
          <span
            className="grid size-24 shrink-0 place-items-center rounded-full border-2"
            style={{
              borderColor: regiao.cor,
              backgroundImage: `radial-gradient(${regiao.cor} 1.4px, transparent 1.7px)`,
              backgroundSize: '7px 7px',
            }}
          >
            <span className="rounded-md bg-fundo px-2 py-0.5 font-mono text-lg font-bold">{m.uf}</span>
          </span>
          <div>
            <h1 className="font-display text-5xl leading-none font-bold tracking-tight uppercase md:text-6xl">{nome}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/uf/$uf" params={{ uf: m.uf }}>
                <Etiqueta cor={regiao.cor}>{nomeUf(m.uf)}</Etiqueta>
              </Link>
              <Etiqueta>Região {regiao.nome}</Etiqueta>
            </div>
          </div>
        </header>
        <aside className="lg:row-span-2">
          <div className="border-b-2 border-texto pb-2 font-bold">Em números</div>
          <Numero
            rotulo="Análises da vigilância"
            valor={vig ? fmt(vig.por_ano.reduce((t, a) => t + a.analises, 0)) : null}
            cor="var(--color-vigilancia)"
            nota="todos os anos"
          />
          <Numero
            rotulo="Registros fora do padrão"
            valor={ctl ? fmt(ctl.por_ano.reduce((t, a) => t + a.registros, 0)) : null}
            cor="var(--color-controle)"
            nota="controle mensal, todos os anos"
          />
          <Numero rotulo="Última coleta da vigilância" valor={vig?.ultima_coleta ? fmtData(vig.ultima_coleta) : null} />
          <Numero
            rotulo="Período com dados"
            valor={anos.size ? `${Math.min(...anos)}–${Math.max(...anos)}` : null}
            nota={anos.size ? `${anos.size} anos` : undefined}
          />
        </aside>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <PainelFonte
            key={`vig-${m.codigo_ibge}`}
            titulo="Vigilância"
            descricao="Análises feitas pelas secretarias de saúde (parâmetros básicos)."
            cor="var(--color-vigilancia)"
            porAno={vig?.por_ano ?? null}
            valor={(a) => a.analises}
            unidade="análises"
          />
          <PainelFonte
            key={`ctl-${m.codigo_ibge}`}
            titulo="Controle fora do padrão"
            descricao="Amostras fora do padrão informadas pelos prestadores do serviço."
            cor="var(--color-controle)"
            porAno={ctl?.por_ano ?? null}
            valor={(a) => a.registros}
            unidade="registros"
          />
        </div>
      </div>

      <Secao
        className="mt-12"
        titulo="Por parâmetro"
        descricao="Contagens e distribuição dos resultados como publicados no OpenDataSUS, sem comparação com limites da legislação."
      >
        <RegistrosPorParametro key={m.codigo_ibge} municipio={m} />
      </Secao>
    </>
  )
}

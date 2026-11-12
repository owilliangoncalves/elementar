import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ElementosDaUf } from '../componentes/ElementosDaUf'
import { IndiceAZ } from '../componentes/IndiceAZ'
import { MapaUf, type Metrica } from '../componentes/MapaUf'
import { Carregando, Faixa, Falha, Recorte, Secao, Seletor, Trilha } from '../componentes/ui'
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

  if (isPending)
    return (
      <Faixa>
        <Carregando texto={`Carregando ${nomeUf(uf)}…`} />
      </Faixa>
    )
  if (error)
    return (
      <Faixa>
        <Falha erro={error} />
      </Faixa>
    )


  return (
    <>
      <Faixa interno="relative overflow-hidden py-10 md:py-14">
        <Trilha>
          <Link to="/" className="hover:text-texto">
            Brasil
          </Link>
          <span>/</span>
          <span>{regiao.nome}</span>
          <span>/</span>
          <span className="text-texto">{nomeUf(uf)}</span>
        </Trilha>

        <div className="mt-10 grid items-end gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="manchete text-6xl sm:text-7xl md:text-9xl">
              {nomeUf(uf)}
              <span className="text-sul">.</span>
            </h1>
            <p className="fita mt-6 px-4 py-2 text-xs">
              {fmt(municipios.length)} municípios com dados
            </p>
          </div>
          <div className="relative hidden md:block">
            <span className="manchete block text-[11rem] leading-[0.8] lg:text-[14rem]" style={{ color: regiao.cor }}>
              {uf}
            </span>
          </div>
        </div>
      </Faixa>

      <Faixa tom="tinta" rasgada interno="py-12 md:py-16">
        <ElementosDaUf uf={uf} />
        <p className="maquina mt-12 max-w-2xl text-sm text-texto-3">
          Contagens brutas, sem ajuste por população. Na água, mais análises indicam mais monitoramento, não
          necessariamente algo pior.
        </p>
      </Faixa>

      <Secao
        titulo={
          <>
            Cidade por <span className="text-sul">cidade.</span>
          </>
        }
        descricao="A intensidade da cor acompanha a contagem do município. Toque numa cidade para ver os dados dela."
        acao={
          <Seletor
            rotulo="Colorir o mapa por"
            valor={metrica}
            onMudar={(v) => setMetrica(v as Metrica)}
            opcoes={METRICAS.map((m) => ({ valor: m.chave, rotulo: m.rotulo }))}
          />
        }
      >
        <figure className="filme">
          <span className="legenda-filme absolute top-0 left-0 rotate-180 whitespace-nowrap opacity-70 [writing-mode:vertical-rl]">
            IBGE · malha municipal · {uf}
          </span>
          <MapaUf
            key={uf}
            uf={uf}
            municipios={municipios}
            metrica={metrica}
            // Mesma cor da região no mapa do Brasil: o estado não muda de cor ao abrir.
            cor={regiao.cor}
            onMunicipio={(codigo) => void navegar({ to: '/municipio/$codigo', params: { codigo } })}
          />
        </figure>
      </Secao>

      <Secao
        tom="papel-2"
        titulo={
          <>
            Municípios <Recorte marca>de A a Z.</Recorte>
          </>
        }
        descricao="Toque num município para ver os dados dele, ou digite o nome."
      >
        <IndiceAZ ufFixa={uf} />
      </Secao>
    </>
  )
}

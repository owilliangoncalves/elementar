import { queryOptions } from '@tanstack/react-query'
import type { Topology } from 'topojson-specification'

// Vazio: mesma origem (a API serve o front; no desenvolvimento o Vite repassa).
const BASE = import.meta.env.VITE_API ?? ''

export interface Estado {
  uf: string
  regiao: string | null
  municipios: number
}

export interface MunicipioResumo {
  codigo_ibge: string
  municipio: string
  uf: string
}

export interface MunicipioComTotais {
  codigo_ibge: string
  municipio: string
  vigilancia_analises: number | null
  controle_fora_do_padrao_registros: number | null
}

export interface MunicipioDoIndice extends MunicipioComTotais {
  uf: string
  regiao: string | null
}

export interface Ano {
  ano: number
  por_parametro: Record<string, number>
}

export interface AnoVigilancia extends Ano {
  analises: number
}

export interface AnoControle extends Ano {
  registros: number
}

// Fonte sem dados para o município vem como null, nunca como zero.
export interface Municipio {
  codigo_ibge: string
  municipio: string
  uf: string
  regiao: string | null
  vigilancia: { ultima_coleta: string | null; por_ano: AnoVigilancia[] } | null
  controle_fora_do_padrao: { por_ano: AnoControle[] } | null
}

export type Tabela = 'vigilancia' | 'controle'

// Histograma de "de" a "ate" (percentil 99) em faixas iguais; "acima" conta o resto.
export interface Numerico {
  valores: number
  de: number
  ate: number
  maximo: number
  q1: number
  mediana: number
  q3: number
  acima: number
  histograma: number[]
}

export interface ParametroVigilancia {
  parametro: string
  analises: number
  por_mes: number[]
  presentes_por_mes: number[]
  motivos: Record<string, number>
  abaixo_do_limite: number
  presenca: { presente: number; ausente: number } | null
  numerico: Numerico | null
}

export interface ParametroControle {
  parametro: string
  registros: number
  zonas: Record<string, number>
  pontos: Record<string, number>
  areas: { area: string; registros: number }[]
  outras_areas: number
}

// Qualidade do ar (SISAM): o dia mais recente com o valor; "dias" conta os empates.
export interface Extremo {
  valor: number
  data: string
  dias: number
}

export interface MesAr {
  mes: string // AAAA-MM
  media: number
  minimo: number
  maximo: number
  dias: number
  origem: 'reanalise' | 'previsao'
}

export interface PoluenteAr {
  poluente: string
  unidade: string
  maximo: Extremo
  minimo: Extremo
  por_mes: MesAr[]
}

// No DF, as Regiões Administrativas recebem o valor do Distrito Federal inteiro.
export interface QualidadeDoAr {
  distrito_federal: boolean
  poluentes: PoluenteAr[]
}

export interface Fonte {
  arquivos: { url: string; modificado_na_fonte: string | null }[]
  baixado_em: string | null
}

async function pegar<T>(caminho: string, signal?: AbortSignal): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, { signal })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    // FastAPI manda texto em erros próprios e uma lista nos de validação (422).
    const detalhe =
      typeof corpo.detail === 'string'
        ? corpo.detail
        : Array.isArray(corpo.detail) && corpo.detail[0]?.msg
          ? `${corpo.detail[0].msg} (${caminho})`
          : `Erro ${resposta.status} em ${caminho}`
    throw new Error(detalhe)
  }
  return resposta.json() as Promise<T>
}

// Os dados só mudam quando a API reinicia: não precisam ser buscados de novo.
const PARA_SEMPRE = { staleTime: Infinity, gcTime: 30 * 60_000 }

export const consultas = {
  estados: () =>
    queryOptions({
      queryKey: ['estados'],
      queryFn: ({ signal }) => pegar<Estado[]>('/estados', signal),
      ...PARA_SEMPRE,
    }),
  indice: () =>
    queryOptions({
      queryKey: ['indice'],
      queryFn: ({ signal }) => pegar<MunicipioDoIndice[]>('/municipios/indice', signal),
      ...PARA_SEMPRE,
    }),
  municipiosDaUf: (uf: string) =>
    queryOptions({
      queryKey: ['uf', uf],
      queryFn: ({ signal }) =>
        pegar<MunicipioComTotais[]>(`/estados/${encodeURIComponent(uf)}/municipios`, signal),
      ...PARA_SEMPRE,
    }),
  busca: (texto: string) =>
    queryOptions({
      queryKey: ['busca', texto],
      queryFn: ({ signal }) =>
        pegar<MunicipioResumo[]>(`/municipios?busca=${encodeURIComponent(texto)}&limite=12`, signal),
      enabled: texto.length >= 2,
      ...PARA_SEMPRE,
    }),
  municipio: (codigo: string) =>
    queryOptions({
      queryKey: ['municipio', codigo],
      queryFn: ({ signal }) => pegar<Municipio>(`/municipios/${encodeURIComponent(codigo)}`, signal),
      ...PARA_SEMPRE,
    }),
  qualidadeDoAr: (codigo: string) =>
    queryOptions({
      queryKey: ['ar', codigo],
      queryFn: ({ signal }) => pegar<QualidadeDoAr>(`/municipios/${encodeURIComponent(codigo)}/ar`, signal),
      ...PARA_SEMPRE,
    }),
  resumoVigilancia: (codigo: string, ano: number, motivo: string) =>
    queryOptions({
      queryKey: ['resumo', codigo, 'vigilancia', ano, motivo],
      queryFn: ({ signal }) => {
        const consulta = new URLSearchParams({ ano: String(ano) })
        if (motivo) consulta.set('motivo', motivo)
        return pegar<ParametroVigilancia[]>(`/municipios/${codigo}/vigilancia/resumo?${consulta}`, signal)
      },
      ...PARA_SEMPRE,
    }),
  resumoControle: (codigo: string, ano: number) =>
    queryOptions({
      queryKey: ['resumo', codigo, 'controle', ano],
      queryFn: ({ signal }) =>
        pegar<ParametroControle[]>(`/municipios/${codigo}/controle/resumo?ano=${ano}`, signal),
      ...PARA_SEMPRE,
    }),
  atualizacao: () =>
    queryOptions({
      queryKey: ['atualizacao'],
      queryFn: ({ signal }) => pegar<Record<string, Fonte>>('/atualizacao', signal),
      ...PARA_SEMPRE,
    }),
  // Malha dos municípios da UF, direto da API de malhas do IBGE. O DF é exceção:
  // o SISAGUA o divide nas Regiões Administrativas, que o IBGE não publica; a
  // malha delas (IPEDF) fica no projeto e as áreas trazem o nome, não o código.
  malhaUf: (uf: string) =>
    queryOptions({
      queryKey: ['malha', uf],
      queryFn: async ({ signal }) => {
        if (uf === 'DF') return (await import('../dados/df-ras.topo.json')).default as unknown as Topology
        const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${uf}?formato=application/json&intrarregiao=municipio&qualidade=intermediaria`
        const resposta = await fetch(url, { signal })
        if (!resposta.ok) throw new Error(`Malha do IBGE indisponível (${resposta.status})`)
        return (await resposta.json()) as Topology
      },
      ...PARA_SEMPRE,
    }),
}

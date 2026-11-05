import { semAcento } from './formato'

// Cada parâmetro tem um matiz tirado da própria química da água. Todos usam a
// mesma luminosidade e saturação (--param-l, --param-c, ajustadas por tema),
// então convivem lado a lado sem que um grite mais que o outro.
const tom = (matiz: number, saturacao = 1) =>
  `oklch(var(--param-l) calc(var(--param-c) * ${saturacao}) ${matiz})`

const FAMILIAS: [RegExp, string][] = [
  // Cristal violeta, o corante da coloração de Gram.
  [/coliforme|escherichia|bacteria/, tom(305)],
  // O verde-amarelado do gás cloro.
  [/cloro/, tom(122)],
  // Âmbar das substâncias húmicas que dão cor à água.
  [/^cor\b/, tom(80)],
  // Turbidez é água leitosa: o mesmo ocre, quase sem saturação.
  [/turbidez/, tom(65, 0.45)],
  [/fluoreto/, tom(195)],
  // Verde do neutro no indicador universal.
  [/^ph$/, tom(150)],
]

export function corDoParametro(parametro: string, padrao: string) {
  const nome = semAcento(parametro)
  return FAMILIAS.find(([padraoNome]) => padraoNome.test(nome))?.[1] ?? padrao
}

export const ehPh = (parametro: string) => semAcento(parametro) === 'ph'

// Indicador universal: vermelho no ácido, verde no neutro, violeta no básico.
const PARADAS_PH: [number, number][] = [
  [0, 20],
  [3, 45],
  [5, 85],
  [7, 145],
  [9, 235],
  [11, 285],
  [14, 315],
]

export function corDoPh(ph: number) {
  const x = Math.min(14, Math.max(0, ph))
  const i = Math.max(1, PARADAS_PH.findIndex(([p]) => p >= x))
  const [p0, m0] = PARADAS_PH[i - 1]
  const [p1, m1] = PARADAS_PH[i]
  return tom(m0 + ((x - p0) / (p1 - p0)) * (m1 - m0))
}

// Faixa do indicador entre dois valores de pH, para a amostra ao lado do título.
export function gradienteDoPh(de = 0, ate = 14) {
  const passos = Array.from({ length: 7 }, (_, i) => corDoPh(de + ((ate - de) * i) / 6))
  return `linear-gradient(90deg, ${passos.join(', ')})`
}

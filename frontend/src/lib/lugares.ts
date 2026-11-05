// Estados e regiões do IBGE. A cor da região só identifica o lugar.

export type ChaveRegiao = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul'

export interface Regiao {
  chave: ChaveRegiao
  nome: string
  cor: string
  ufs: string[]
}

export const REGIOES: Regiao[] = [
  { chave: 'norte', nome: 'Norte', cor: 'var(--color-norte)', ufs: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
  { chave: 'nordeste', nome: 'Nordeste', cor: 'var(--color-nordeste)', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { chave: 'centro-oeste', nome: 'Centro-Oeste', cor: 'var(--color-centro-oeste)', ufs: ['DF', 'GO', 'MS', 'MT'] },
  { chave: 'sudeste', nome: 'Sudeste', cor: 'var(--color-sudeste)', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { chave: 'sul', nome: 'Sul', cor: 'var(--color-sul)', ufs: ['PR', 'RS', 'SC'] },
]

export const NOMES_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

// Código IBGE da UF (dois dígitos, como vem nas malhas) para a sigla.
export const SIGLA_DO_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

const REGIAO_DA_UF = new Map(REGIOES.flatMap((r) => r.ufs.map((uf) => [uf, r] as const)))

export function regiaoDaUf(uf: string): Regiao {
  return REGIAO_DA_UF.get(uf.toUpperCase()) ?? REGIOES[0]
}

export const nomeUf = (uf: string) => NOMES_UF[uf.toUpperCase()] ?? uf

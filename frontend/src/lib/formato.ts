const numero = new Intl.NumberFormat('pt-BR')
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const fmt = (n: number | null | undefined) => (n == null ? '—' : numero.format(n))
export const fmtCompacto = (n: number | null | undefined) => (n == null ? '—' : compacto.format(n))

export function fmtData(iso: string | null | undefined) {
  if (!iso) return '—'
  const soData = iso.length === 10
  const d = new Date(soData ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', soData ? { timeZone: 'UTC' } : {})
}

export const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd'])

// Os nomes vêm em maiúsculas no SISAGUA: "SAO JOAO D'ALIANCA" vira "Sao Joao d'Alianca".
export function tituloNome(nome: string) {
  return nome
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((parte, i) =>
      i > 0 && MINUSCULAS.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join('')
}

export function rotuloColuna(coluna: string) {
  const texto = coluna.replaceAll('_', ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function inicial(nome: string) {
  const letra = semAcento(nome).charAt(0).toUpperCase()
  return /[A-Z]/.test(letra) ? letra : '#'
}

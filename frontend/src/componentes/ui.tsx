// Peças visuais pequenas, reaproveitadas nas páginas.

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ChevronDown } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Junta classes resolvendo conflitos do Tailwind: a última vence ("grid" + "hidden").
export const cn = (...classes: ClassValue[]) => twMerge(clsx(classes))

export function BotaoRedondo({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'grid size-10 place-items-center rounded-full border border-linha text-texto-2 transition hover:border-texto-3 hover:text-texto',
        className,
      )}
      {...props}
    />
  )
}

export function Pilula({
  ativa,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { ativa?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition',
        ativa
          ? 'border-texto bg-texto text-fundo'
          : 'border-linha text-texto-2 hover:border-texto-3 hover:text-texto',
        className,
      )}
      {...props}
    />
  )
}

export function Secao({
  titulo,
  descricao,
  classeDescricao,
  acao,
  children,
  className,
}: {
  titulo: string
  descricao?: ReactNode
  classeDescricao?: string
  acao?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-t border-linha pt-8', className)}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{titulo}</h2>
          {descricao && <p className={cn('mt-2 text-texto-2', classeDescricao)}>{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

export function Numero({ valor, rotulo, cor, nota }: { valor: ReactNode; rotulo: string; cor?: string; nota?: ReactNode }) {
  const vazio = valor == null || valor === '—'
  return (
    <div className="border-b border-linha py-4 last:border-b-0">
      <div className="text-sm font-semibold text-texto-2">{rotulo}</div>
      <div
        className={cn('font-display leading-none', vazio ? 'mt-2 text-2xl text-texto-3' : 'mt-1 text-5xl font-medium')}
        style={vazio ? undefined : { color: cor }}
      >
        {vazio ? 'Sem dados' : valor}
      </div>
      {nota && <div className="mt-1 text-xs text-texto-3">{nota}</div>}
    </div>
  )
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-linha px-3 py-1 text-xs font-semibold text-texto-2"
    >
      {cor && <span className="size-2 rounded-full" style={{ background: cor }} />}
      {children}
    </span>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-texto-3">
      <span className="size-6 animate-spin rounded-full border-2 border-linha border-t-texto-2" />
      {texto}
    </div>
  )
}

export function Falha({ erro }: { erro: Error }) {
  return (
    <div className="py-20 text-center text-texto-3">
      <div className="text-lg font-semibold text-texto">Não foi possível carregar</div>
      {erro.message}
    </div>
  )
}

export function Aviso({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-texto-3">{children}</div>
}

export function Barra({ fracao, cor }: { fracao: number; cor: string }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-superficie-2">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%`, background: cor }} />
    </span>
  )
}

// Lista de escolha em formato de pílula, a mesma em todos os filtros.
export function Seletor({
  valor,
  onMudar,
  rotulo,
  opcoes,
}: {
  valor: string
  onMudar: (valor: string) => void
  rotulo: string
  opcoes: { valor: string; rotulo: string }[]
}) {
  return (
    <label className="relative max-w-full">
      <select
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        aria-label={rotulo}
        className="h-11 max-w-full appearance-none rounded-full border border-linha bg-superficie pr-10 pl-4 text-sm font-semibold outline-none focus:border-texto-3"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-texto-3" />
    </label>
  )
}

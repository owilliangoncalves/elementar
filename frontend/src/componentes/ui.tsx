// Peças visuais pequenas, reaproveitadas nas páginas.

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Junta classes resolvendo conflitos do Tailwind: a última vence ("grid" + "hidden").
export const cn = (...classes: ClassValue[]) => twMerge(clsx(classes))

// Tons das faixas que empilham a página: papel, tinta preta e a cor da marca.
const TONS = {
  papel: '',
  'papel-2': 'bg-superficie-2 dark:bg-transparent',
  tinta: 'faixa-tinta',
  marca: 'faixa-marca',
} as const

export type Tom = keyof typeof TONS

// Faixa de ponta a ponta com o conteúdo na largura da página.
export function Faixa({
  tom = 'papel',
  rasgada,
  className,
  interno,
  children,
}: {
  tom?: Tom
  rasgada?: boolean
  className?: string
  interno?: string
  children: ReactNode
}) {
  return (
    <div className={cn(TONS[tom], rasgada && 'rasgado pt-3', className)}>
      <div className={cn('mx-auto max-w-7xl px-4 md:px-6', interno)}>{children}</div>
    </div>
  )
}

// Pedaços colados dentro da manchete: em tinta ou na cor da marca.
export function Recorte({ children, marca }: { children: ReactNode; marca?: boolean }) {
  return <span className={marca ? 'recorte-marca' : 'recorte'}>{children}</span>
}

export function BotaoRedondo({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'grid size-10 place-items-center border-2 border-texto/80 text-texto transition hover:bg-texto hover:text-fundo',
        className,
      )}
      {...props}
    />
  )
}

// O quadrado com a seta no canto dos cartões.
export function SetaCanto({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center bg-sul text-[#15171c]', className)}>
      <ArrowUpRight className="size-4" />
    </span>
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
        'rotulo border-2 px-3 py-2 whitespace-nowrap transition',
        ativa ? 'border-texto bg-texto text-fundo' : 'border-linha text-texto-2 hover:border-texto hover:text-texto',
        className,
      )}
      {...props}
    />
  )
}

// Seção: faixa inteira, manchete e conteúdo.
export function Secao({
  titulo,
  descricao,
  classeDescricao,
  acao,
  tom = 'papel',
  rasgada,
  children,
  className,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  classeDescricao?: string
  acao?: ReactNode
  tom?: Tom
  rasgada?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <Faixa tom={tom} rasgada={rasgada} interno="py-14 md:py-20">
        <div className="mb-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="border-l-2 border-sul pl-5 md:pl-8">
            <h2 className="manchete text-5xl md:text-7xl">{titulo}</h2>
            {descricao && <p className={cn('maquina mt-5 max-w-2xl text-texto-2', classeDescricao)}>{descricao}</p>}
          </div>
          {acao}
        </div>
        {children}
      </Faixa>
    </section>
  )
}

export function Numero({ valor, rotulo, cor, nota }: { valor: ReactNode; rotulo: string; cor?: string; nota?: ReactNode }) {
  const vazio = valor == null || valor === '—'
  return (
    <div className="border-b border-linha py-5 last:border-b-0">
      <div className="rotulo flex items-center gap-2 text-texto-2">
        {cor && <span className="size-2.5" style={{ background: cor }} />}
        {rotulo}
      </div>
      <div
        className={cn('font-display leading-none', vazio ? 'mt-2 text-2xl text-texto-3' : 'mt-2 text-5xl md:text-6xl')}
        style={vazio ? undefined : { color: cor }}
      >
        {vazio ? 'Sem dados' : valor}
      </div>
      {nota && <div className="maquina mt-2 text-sm text-texto-3">{nota}</div>}
    </div>
  )
}

// Linha de números grandes separados por fios, como nas faixas de resultados.
export function Estatisticas({
  itens,
  className,
}: {
  itens: { valor: ReactNode; rotulo: string; cor?: string }[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-8 md:flex md:colunas-fio', className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="md:flex-1 md:px-8 md:first:pl-0">
          <dd className="font-display text-[2.1rem] leading-none whitespace-nowrap sm:text-5xl lg:text-6xl xl:text-7xl" style={{ color: item.cor }}>
            {item.valor ?? '—'}
          </dd>
          <dt className="rotulo mt-3 max-w-[14rem] opacity-80">{item.rotulo}</dt>
        </div>
      ))}
    </dl>
  )
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor?: string }) {
  return (
    <span className="rotulo inline-flex items-center gap-1.5 border-2 border-texto px-2.5 py-1">
      {cor && <span className="size-2.5" style={{ background: cor }} />}
      {children}
    </span>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-texto-3">
      <span className="size-7 animate-spin border-[3px] border-linha border-t-sul" />
      <span className="maquina">{texto}</span>
    </div>
  )
}

export function Falha({ erro }: { erro: Error }) {
  return (
    <div className="flex flex-col items-center py-24 text-center text-texto-3">
      <div className="manchete text-5xl text-texto">Não foi possível carregar.</div>
      <p className="maquina mt-3">{erro.message}</p>
    </div>
  )
}

export function Aviso({ children }: { children: ReactNode }) {
  return <div className="maquina py-12 text-center text-texto-3">{children}</div>
}

export function Barra({ fracao, cor, grossa }: { fracao: number; cor: string; grossa?: boolean }) {
  return (
    <span className={cn('block overflow-hidden bg-texto/10', grossa ? 'h-2.5' : 'h-1.5')}>
      <span className="block h-full" style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%`, background: cor }} />
    </span>
  )
}

// Lista de escolha, a mesma em todos os filtros. O texto visível fica num
// rótulo próprio e o select nativo, transparente, vai por cima: assim a
// largura acompanha o texto em caixa alta em qualquer navegador (o Safari mede
// o select sem a caixa alta e cortava o texto).
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
  const atual = opcoes.find((o) => o.valor === valor)?.rotulo ?? rotulo
  return (
    <label className="relative inline-flex h-11 max-w-full items-center gap-3 border-2 border-texto px-4 text-texto focus-within:border-sul">
      <span className="rotulo truncate">{atual}</span>
      <ChevronDown className="pointer-events-none size-4 shrink-0 text-texto-2" />
      <select
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        aria-label={rotulo}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Trilha({ children }: { children: ReactNode }) {
  return <nav className="rotulo flex flex-wrap items-center gap-2 text-texto-3">{children}</nav>
}

import { Link, Outlet } from '@tanstack/react-router'
import { ArrowUpRight, Search } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Busca } from './Busca'
import { AlternarTema } from './Tema'
import { BotaoRedondo, Carregando, Faixa } from './ui'

const MENU = [
  { para: '/', rotulo: 'Mapa' },
  { para: '/municipios', rotulo: 'Municípios' },
  { para: '/sobre', rotulo: 'Sobre os dados' },
] as const

function Marca({ className }: { className?: string }) {
  return (
    <span className={className}>
      Elementar<span className="text-sul">.</span>
    </span>
  )
}

export function Layout() {
  const [buscaAberta, setBuscaAberta] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="faixa-tinta sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span aria-hidden className="size-3.5 bg-sul" />
            <Marca className="manchete text-2xl" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className="rotulo hidden h-10 items-center gap-3 bg-sul px-4 text-[#15171c] transition hover:brightness-110 md:flex"
            >
              <Search className="size-4" />
              Buscar município
              <kbd className="font-mono opacity-60">⌘K</kbd>
            </button>
            <BotaoRedondo className="md:hidden" onClick={() => setBuscaAberta(true)} aria-label="Buscar município">
              <Search className="size-4" />
            </BotaoRedondo>
            <AlternarTema />
          </div>
        </div>
      </header>

      <main className="w-full flex-1">
        <Suspense
          fallback={
            <Faixa>
              <Carregando />
            </Faixa>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="faixa-tinta rasgado pt-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-10 md:px-6">
          <Marca className="manchete text-3xl" />
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {MENU.map((item) => (
              <Link key={item.rotulo} to={item.para} className="rotulo inline-flex items-center gap-2 text-texto-2 hover:text-texto">
                {item.rotulo}
                <ArrowUpRight className="size-3.5" />
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      <Busca aberta={buscaAberta} onMudar={setBuscaAberta} />
    </div>
  )
}

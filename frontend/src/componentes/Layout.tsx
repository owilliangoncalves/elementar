import { Link, Outlet } from '@tanstack/react-router'
import { Droplet, Search } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Busca } from './Busca'
import { AlternarTema } from './Tema'
import { BotaoRedondo, Carregando } from './ui'

const RODAPE = [
  { para: '/', rotulo: 'Mapa' },
  { para: '/sobre', rotulo: 'Sobre os dados' },
] as const

export function Layout() {
  const [buscaAberta, setBuscaAberta] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-fundo">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <Droplet className="size-6 fill-sul text-sul" strokeWidth={1.5} />
            elementar
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className="hidden h-10 items-center gap-2 rounded-full border border-linha px-4 text-sm text-texto-3 transition hover:border-texto-3 md:flex"
            >
              <Search className="size-4" />
              Buscar município
              <kbd className="ml-4 font-mono text-xs">⌘K</kbd>
            </button>
            <BotaoRedondo className="md:hidden" onClick={() => setBuscaAberta(true)} aria-label="Buscar município">
              <Search className="size-4" />
            </BotaoRedondo>
            <AlternarTema />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 md:px-6">
        <Suspense fallback={<Carregando />}>
          <Outlet />
        </Suspense>
      </main>

      <footer>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm md:px-6">
          {RODAPE.map((item) => (
            <Link key={item.rotulo} to={item.para} className="font-semibold text-texto-2 hover:text-texto">
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </footer>

      <Busca aberta={buscaAberta} onMudar={setBuscaAberta} />
    </div>
  )
}

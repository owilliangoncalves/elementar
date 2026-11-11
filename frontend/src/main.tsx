import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/anton'
import '@fontsource/special-elite'
import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Layout } from './componentes/Layout'
import { Inicio } from './paginas/Inicio'
import { Municipios } from './paginas/Municipios'
import { Sobre } from './paginas/Sobre'

// Gráficos e tabelas só são baixados quando a página é aberta.
const Estado = lazy(() => import('./paginas/Estado').then((m) => ({ default: m.Estado })))
const Municipio = lazy(() => import('./paginas/Municipio').then((m) => ({ default: m.Municipio })))

const raiz = createRootRoute({ component: Layout })
const rotas = raiz.addChildren([
  createRoute({ getParentRoute: () => raiz, path: '/', component: Inicio }),
  createRoute({ getParentRoute: () => raiz, path: '/municipios', component: Municipios }),
  createRoute({ getParentRoute: () => raiz, path: '/uf/$uf', component: Estado }),
  createRoute({ getParentRoute: () => raiz, path: '/municipio/$codigo', component: Municipio }),
  createRoute({ getParentRoute: () => raiz, path: '/sobre', component: Sobre }),
])

// Rotas no hash (#/uf/SP): os caminhos sem hash pertencem à API.
const router = createRouter({ routeTree: rotas, history: createHashHistory(), scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const cliente = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

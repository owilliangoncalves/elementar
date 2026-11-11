import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { consultas } from '../lib/api'
import { tituloNome } from '../lib/formato'
import { nomeUf, regiaoDaUf } from '../lib/lugares'

function useAtrasado<T>(valor: T, ms: number) {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const espera = setTimeout(() => setAtrasado(valor), ms)
    return () => clearTimeout(espera)
  }, [valor, ms])
  return atrasado
}

// Paleta de busca (⌘K ou /) por nome de município, sem diferenciar acentos.
export function Busca({ aberta, onMudar }: { aberta: boolean; onMudar: (aberta: boolean) => void }) {
  const [texto, setTexto] = useState('')
  const termo = useAtrasado(texto.trim(), 180)
  const navegar = useNavigate()
  const { data = [], isFetching } = useQuery(consultas.busca(termo))

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const digitando = e.target instanceof HTMLElement && e.target.closest('input, textarea, select')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !digitando)) {
        e.preventDefault()
        onMudar(true)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onMudar])

  const ir = (codigo: string) => {
    onMudar(false)
    setTexto('')
    void navegar({ to: '/municipio/$codigo', params: { codigo } })
  }

  return (
    <Command.Dialog
      open={aberta}
      onOpenChange={onMudar}
      shouldFilter={false}
      label="Buscar município"
      overlayClassName="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      contentClassName="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden border-2 border-texto bg-fundo shadow-[6px_6px_0_var(--color-sul)]"
    >
      <div className="flex items-center gap-3 border-b border-linha px-4">
        <Search className="size-4 text-texto-3" />
        <Command.Input
          value={texto}
          onValueChange={setTexto}
          placeholder="Digite o nome do município"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-texto-3"
        />
        <kbd className="rotulo border border-linha px-1.5 text-texto-3">esc</kbd>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        {termo.length < 2 ? (
          <div className="px-3 py-6 text-center text-sm text-texto-3">Digite ao menos duas letras.</div>
        ) : (
          <>
            {isFetching && data.length === 0 && (
              <Command.Loading>
                <div className="px-3 py-6 text-center text-sm text-texto-3">Buscando…</div>
              </Command.Loading>
            )}
            {!isFetching && (
              <Command.Empty className="px-3 py-6 text-center text-sm text-texto-3">
                Nenhum município encontrado.
              </Command.Empty>
            )}
            {data.map((m) => (
              <Command.Item
                key={m.codigo_ibge}
                value={m.codigo_ibge}
                onSelect={ir}
                className="flex cursor-pointer items-center justify-between gap-3 border-b border-dashed border-linha px-3 py-2.5 last:border-b-0 data-[selected=true]:bg-superficie-2"
              >
                <span className="font-semibold">{tituloNome(m.municipio)}</span>
                <span className="flex items-center gap-2 text-sm text-texto-3">
                  {nomeUf(m.uf)}
                  <span className="font-mono text-xs font-bold" style={{ color: regiaoDaUf(m.uf).cor }}>
                    {m.uf}
                  </span>
                </span>
              </Command.Item>
            ))}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

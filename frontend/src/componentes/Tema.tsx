import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { BotaoRedondo } from './ui'

type Tema = 'light' | 'dark'

export function AlternarTema({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(
    () => (document.documentElement.dataset.theme as Tema | undefined) ?? 'dark',
  )

  const alternar = () => {
    const novo: Tema = tema === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = novo
    try {
      localStorage.setItem('tema', novo)
    } catch {
      // Sem armazenamento (aba anônima): o tema vale só nesta visita.
    }
    setTema(novo)
  }

  return (
    <BotaoRedondo className={className} onClick={alternar} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
      {tema === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </BotaoRedondo>
  )
}

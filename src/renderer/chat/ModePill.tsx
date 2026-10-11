import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { PERMISSION_MODES } from '../../shared/ipc'
import type { PermissionMode } from '../../shared/ipc'
import { BoltIcon, CheckIcon, ChevronDownIcon, PencilIcon, PlanIcon, ShieldIcon } from './icons'
import { MODE_TEXT } from './modes'

/** O ícone de cada modo. */
const ICONS: Record<PermissionMode, () => JSX.Element> = {
  default: ShieldIcon,
  acceptEdits: PencilIcon,
  plan: PlanIcon,
  auto: BoltIcon
}

/**
 * Pílula do modo de permissão, ao lado da do modelo. Vale para a conversa desta aba, na hora,
 * mesmo com uma resposta em andamento. Shift+Tab na caixa de texto passa para o próximo.
 */
export function ModePill({
  mode,
  onPick
}: {
  mode: PermissionMode
  onPick: (mode: PermissionMode) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = MODE_TEXT[mode]
  const Icon = ICONS[mode]
  return (
    <div
      className="model mode"
      ref={root}
      onKeyDown={(event) => {
        // Esc fecha o menu, e não o painel.
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={`model-pill mode-pill mode-${mode}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Permissões: ${current.label} (${current.hint}). Shift+Tab troca.`}
      >
        <Icon />
        <span>{current.label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="model-menu" role="menu">
          {PERMISSION_MODES.map((option) => {
            const selected = option === mode
            const OptionIcon = ICONS[option]
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`model-option mode-option mode-${option}${selected ? ' selected' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (!selected) onPick(option)
                }}
              >
                <span className="model-check">{selected ? <CheckIcon /> : <OptionIcon />}</span>
                <span className="model-text">
                  <strong>{MODE_TEXT[option].label}</strong>
                  <small>{MODE_TEXT[option].hint}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

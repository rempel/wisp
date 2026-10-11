import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { MODEL_CHOICES } from '../../shared/ipc'
import { CheckIcon, ChevronDownIcon, ModelIcon } from './icons'

const FAMILIES: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  fable: 'Fable'
}

/** "claude-sonnet-5-5" vira "Sonnet 5.5"; o que não tiver esse formato fica como veio. */
function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[\w+\])?$/.exec(model)
  if (!match) return FAMILIES[model] ?? model
  const family = FAMILIES[match[1]] ?? match[1][0].toUpperCase() + match[1].slice(1)
  return match[3] ? `${family} ${match[2]}.${match[3]}` : `${family} ${match[2]}`
}

/** O texto da pílula: o modelo que está respondendo, com a versão quando já se sabe. */
function pillLabel(choice: string | null, active: string | null): string {
  if (!choice) return active ? `Padrão · ${modelName(active)}` : 'Padrão'
  // O que respondeu por último é da família escolhida: mostra a versão exata.
  if (active && (active === choice || active.includes(`-${choice}-`))) return modelName(active)
  return FAMILIES[choice] ?? modelName(choice)
}

/**
 * Pílula do modelo, acima da caixa de texto: mostra quem está respondendo e abre um menu para
 * trocar. A troca vale a partir da próxima mensagem, sem perder a conversa.
 */
export function ModelPill({
  choice,
  active,
  onPick
}: {
  choice: string | null
  active: string | null
  onPick: (model: string | null) => void
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

  const pick = (model: string | null): void => {
    setOpen(false)
    if (model !== choice) onPick(model)
  }
  // Um modelo do config.json fora da lista também aparece, marcado.
  const options: (string | null)[] = [null, ...MODEL_CHOICES]
  if (choice && !options.includes(choice)) options.push(choice)

  return (
    <div
      className="model"
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
        className="model-pill"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Modelo do Claude (a troca vale a partir da próxima mensagem)"
      >
        <ModelIcon />
        <span>{pillLabel(choice, active)}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="model-menu" role="menu">
          {options.map((model) => {
            const selected = model === choice
            return (
              <button
                key={model ?? 'padrão'}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`model-option${selected ? ' selected' : ''}`}
                onClick={() => pick(model)}
              >
                <span className="model-check">{selected && <CheckIcon />}</span>
                <span className="model-text">
                  <strong>{model ? (FAMILIES[model] ?? modelName(model)) : 'Padrão'}</strong>
                  {model === null && <small>o que estiver configurado no Claude Code</small>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

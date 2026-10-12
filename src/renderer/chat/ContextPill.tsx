import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { formatTokens } from '../../shared/format'
import type { ContextUsage } from '../../shared/ipc'

/** Verde até 60%, âmbar até 85%, vermelho acima. */
function level(share: number): 'low' | 'mid' | 'high' {
  if (share >= 0.85) return 'high'
  return share >= 0.6 ? 'mid' : 'low'
}

/**
 * A pílula do contexto, abaixo da caixa: quanto da janela de contexto do modelo a conversa já
 * ocupa. Abre um cartão com os tokens e o "Compactar agora" (o /compact do Claude Code), com
 * instruções opcionais do que manter. Perto do limite, o Claude Code compacta sozinho.
 */
export function ContextPill({
  context,
  busy,
  onCompact
}: {
  context: ContextUsage
  busy: boolean
  onCompact: (instructions: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const share = context.window ? Math.min(1, context.used / context.window) : null
  const percent = share === null ? null : Math.round(share * 100)
  const label = context.compacting
    ? 'compactando…'
    : percent === null
      ? formatTokens(context.used)
      : `${percent}%`
  const compact = (): void => {
    onCompact(instructions)
    setInstructions('')
    setOpen(false)
  }

  return (
    <div
      className="model context"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={`model-pill context-pill context-${share === null ? 'low' : level(share)}${context.compacting ? ' compacting' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Quanto da janela de contexto esta conversa ocupa"
      >
        <span className="context-ring" aria-hidden>
          <svg viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" className="context-track" />
            <circle
              cx="8"
              cy="8"
              r="6"
              className="context-fill"
              strokeDasharray={`${(share ?? 0) * 37.7} 37.7`}
            />
          </svg>
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="model-menu context-card" role="dialog" aria-label="Contexto da conversa">
          <div className="usage-title">Contexto desta conversa</div>
          <div
            className={`usage-bar context-bar usage-${share === null ? 'low' : level(share)}`}
            role="progressbar"
            aria-valuenow={percent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${percent ?? 0}%` }} />
          </div>
          <p className="context-numbers">
            {formatTokens(context.used)} tokens
            {context.window ? ` de ${formatTokens(context.window)} (${percent}%)` : ''}
          </p>
          <p className="model-menu-note">
            É o que o Claude tem em mente agora: as mensagens, o que as ferramentas devolveram e os
            arquivos lidos. Perto do limite, o Claude Code compacta sozinho. Compactar troca o que
            veio antes por um resumo; o painel continua mostrando tudo.
          </p>
          <input
            type="text"
            className="openrouter-search context-instructions"
            placeholder="O que manter no resumo (opcional)"
            value={instructions}
            maxLength={500}
            spellCheck={false}
            onChange={(event) => setInstructions(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy && !context.compacting) {
                event.preventDefault()
                compact()
              }
            }}
          />
          <button
            type="button"
            className="settings-button context-compact"
            disabled={busy || context.compacting}
            onClick={compact}
            title={busy ? 'Espere a resposta terminar' : undefined}
          >
            {context.compacting ? 'Compactando…' : 'Compactar agora'}
          </button>
        </div>
      )}
    </div>
  )
}

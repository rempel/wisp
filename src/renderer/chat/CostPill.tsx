import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { formatTokens, formatUsd } from '../../shared/format'
import type { ConversationCost } from '../../shared/ipc'

/**
 * Pílula do custo, no cabeçalho, numa conversa pela OpenRouter (no lugar do uso do plano): quanto
 * a conversa custou até agora, estimado pelos preços que a OpenRouter publica.
 */
export function CostPill({ cost }: { cost: ConversationCost | null }): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = !cost ? 'US$ 0' : cost.usd === null ? 'sem preço' : formatUsd(cost.usd)
  return (
    <div
      className="usage"
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
        className="usage-pill cost-pill"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Custo estimado desta conversa na OpenRouter"
      >
        {label}
      </button>
      {open && (
        <div className="usage-card" role="dialog" aria-label="Custo da conversa">
          <div className="usage-title">Custo desta conversa</div>
          {cost ? (
            <dl className="cost-rows">
              <dt>Estimado</dt>
              <dd>{cost.usd === null ? 'sem o preço do modelo' : formatUsd(cost.usd)}</dd>
              <dt>Tokens de entrada</dt>
              <dd>{formatTokens(cost.inputTokens)}</dd>
              <dt>Tokens de saída</dt>
              <dd>{formatTokens(cost.outputTokens)}</dd>
              <dt>Respostas</dt>
              <dd>{cost.turns}</dd>
            </dl>
          ) : (
            <p className="usage-foot">Nenhuma resposta ainda.</p>
          )}
          <div className="usage-foot">
            Pelos preços que a OpenRouter publica, desde que a conversa abriu aqui. O valor cobrado
            de verdade fica no painel da OpenRouter.
          </div>
        </div>
      )}
    </div>
  )
}

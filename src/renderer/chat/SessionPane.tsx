import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SessionsSnapshot } from '../../shared/ipc'
import { TerminalIcon } from './icons'
import { SESSION_TICK_MS, SessionCard } from './SessionsView'

/**
 * Uma sessão do Claude Code no terminal, numa aba: o que ela faz agora, os pedidos esperando
 * resposta (com os mesmos cards do chat) e os passos, para acompanhar lado a lado com outras.
 */
export function SessionPane({
  sessionId,
  snapshot,
  onClose
}: {
  sessionId: string
  snapshot: SessionsSnapshot | null
  onClose: () => void
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), SESSION_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])
  const session = snapshot?.sessions.find((item) => item.id === sessionId)
  return (
    <div className="session-pane sessions">
      {session ? (
        <SessionCard session={session} now={now} onContinue={() => {}} expanded />
      ) : (
        <div className="sessions-empty">
          <TerminalIcon />
          <p>Esta sessão saiu da lista (encerrada e esquecida).</p>
          <button type="button" className="link" onClick={onClose}>
            Fechar a aba
          </button>
        </div>
      )}
    </div>
  )
}

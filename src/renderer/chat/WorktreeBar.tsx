import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffCount } from './DiffView'
import type { WorktreeStatus } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/**
 * A barra de uma conversa numa cópia do Git (Fase 43): de qual projeto, o ramo, o que mudou nela,
 * e Juntar (na pasta original, sem commit) ou Descartar (a cópia e o ramo saem; pede uma
 * confirmação). Fora de uma cópia, nada. Relê depois de cada resposta (`busy` volta a false).
 */
export function WorktreeBar({
  conversation,
  folder,
  busy
}: {
  conversation: string
  folder: string | null
  busy: boolean
}): JSX.Element | null {
  const [status, setStatus] = useState<WorktreeStatus | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [working, setWorking] = useState(false)

  const load = (): Promise<WorktreeStatus | null> =>
    folder ? window.wisp.tabs.worktreeStatus(conversation) : Promise.resolve(null)

  useEffect(() => {
    if (busy) return
    let alive = true
    void (folder ? window.wisp.tabs.worktreeStatus(conversation) : Promise.resolve(null)).then(
      (next) => {
        if (alive) setStatus(next)
      }
    )
    return () => {
      alive = false
    }
  }, [busy, conversation, folder])

  if (!status) return null
  const added = status.changes.reduce((sum, change) => sum + change.added, 0)
  const removed = status.changes.reduce((sum, change) => sum + change.removed, 0)

  const run = async (action: 'join' | 'discard'): Promise<void> => {
    setWorking(true)
    setMessage(null)
    try {
      const result =
        action === 'join'
          ? await window.wisp.tabs.worktreeJoin(conversation)
          : await window.wisp.tabs.worktreeDiscard(conversation)
      setMessage({ ok: result.ok, text: result.message })
      setConfirm(false)
      setStatus(await load())
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="worktree-bar" role="region" aria-label={t('Cópia do projeto')}>
      <div className="worktree-line">
        <span className="worktree-what">
          {t('Numa cópia de')} <code>{status.repo}</code> {t('no ramo')}{' '}
          <code>{status.branch}</code>
        </span>
        <span className="worktree-count">
          {status.changes.length === 0
            ? t('sem mudanças')
            : status.changes.length === 1
              ? t('1 arquivo mudou')
              : t('{count} arquivos mudaram', { count: status.changes.length })}
        </span>
        <DiffCount diff={{ added, removed, hunks: [], truncated: false }} />
        <button
          type="button"
          className="settings-button"
          disabled={working || busy || !status.changes.length}
          title={t('As mudanças da cópia entram na pasta original, sem commit')}
          onClick={() => void run('join')}
        >
          {t('Juntar na pasta original')}
        </button>
        {confirm ? (
          <button
            type="button"
            className="settings-button danger"
            disabled={working || busy}
            onClick={() => void run('discard')}
          >
            {t('Descartar de vez?')}
          </button>
        ) : (
          <button
            type="button"
            className="settings-button"
            disabled={working || busy}
            onClick={() => setConfirm(true)}
          >
            {t('Descartar')}
          </button>
        )}
      </div>
      {status.changes.length > 0 && (
        <ul className="worktree-files">
          {status.changes.map((change) => (
            <li key={change.path}>
              <code>{change.path}</code>
              <DiffCount diff={{ ...change, hunks: [], truncated: false }} />
            </li>
          ))}
        </ul>
      )}
      {(message || status.error) && (
        <small
          className={message?.ok ? 'settings-hint' : 'settings-error'}
          role={message?.ok ? 'status' : 'alert'}
        >
          {message?.text ?? status.error}
        </small>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { formatWhen } from '../../shared/format'
import type { ConversationSummary } from '../../shared/ipc'
import { SearchIcon, TrashIcon } from './icons'
import { WeekCard } from './WeekCard'

const DAY = 86_400_000

/** Em que grupo da lista a conversa entra, pela última atividade. */
function groupOf(updatedAt: number, today: number): string {
  if (updatedAt >= today) return 'Hoje'
  if (updatedAt >= today - DAY) return 'Ontem'
  if (updatedAt >= today - 6 * DAY) return 'Nesta semana'
  return 'Antes'
}

/** Busca sem diferenciar maiúsculas nem acentos. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * As conversas guardadas: a mais recente primeiro, agrupadas por dia, com busca pelo título.
 * Abrir uma traz a conversa de volta para o painel; o Claude continua de onde parou.
 */
export function HistoryView({ onClose }: { onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Meia-noite de hoje, fixada quando a lista carrega.
  const [today, setToday] = useState(0)

  const show = useCallback((list: ConversationSummary[]): void => {
    const now = new Date()
    setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())
    setItems(list)
  }, [])
  const load = (): void => void window.wisp.history.list().then(show)

  useEffect(() => {
    let alive = true
    void window.wisp.history.list().then((list) => alive && show(list))
    return () => {
      alive = false
    }
  }, [show])

  async function open(item: ConversationSummary): Promise<void> {
    // Aberta numa aba (talvez fora da vista): o main só mostra a aba dela.
    if (await window.wisp.history.open(item.id)) return onClose()
    setError('Não consegui abrir esta conversa: o arquivo dela sumiu ou está estragado.')
    load()
  }

  async function remove(id: string): Promise<void> {
    setConfirming(null)
    if (!(await window.wisp.history.remove(id))) setError('Não consegui apagar esta conversa.')
    load()
  }

  const shown = items?.filter((item) => fold(item.title).includes(fold(query.trim()))) ?? []
  // O título do grupo vai antes da primeira conversa de cada grupo.
  const groups = shown.map((item) => groupOf(item.updatedAt, today))

  return (
    <div className="history">
      <WeekCard />
      <label className="history-search">
        <SearchIcon />
        <input
          value={query}
          placeholder="Buscar conversas…"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error && (
        <div className="attach-error" role="alert">
          {error}
        </div>
      )}
      <div className="history-list">
        {items === null ? null : shown.length === 0 ? (
          <p className="history-empty">
            {items.length === 0
              ? 'Nenhuma conversa guardada ainda. Elas aparecem aqui a partir da primeira mensagem.'
              : 'Nenhuma conversa com esse título.'}
          </p>
        ) : (
          shown.map((item, index) => {
            const heading = groups[index] !== groups[index - 1] ? groups[index] : null
            return (
              <div key={item.id}>
                {heading && <div className="history-group">{heading}</div>}
                {confirming === item.id ? (
                  <div className="history-item confirming">
                    <span className="history-title">Apagar “{item.title}”?</span>
                    <button type="button" className="danger" onClick={() => void remove(item.id)}>
                      Apagar
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className={`history-item${item.current ? ' current' : ''}`}>
                    <button
                      type="button"
                      className="history-open"
                      onClick={() => void open(item)}
                      title={item.title}
                    >
                      {item.project && <span className="history-project">{item.project}</span>}
                      <span className="history-title">{item.title}</span>
                      {item.current ? (
                        <span className="history-badge">aberta</span>
                      ) : (
                        <span className="history-when">{formatWhen(item.updatedAt)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="history-delete"
                      onClick={() => setConfirming(item.id)}
                      title="Apagar do histórico"
                      aria-label={`Apagar “${item.title}” do histórico`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

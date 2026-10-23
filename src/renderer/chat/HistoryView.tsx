import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { formatWhen } from '../../shared/format'
import type { ConversationSummary } from '../../shared/ipc'
import { DownloadIcon, PinIcon, SearchIcon, TrashIcon } from './icons'
import { WeekCard } from './WeekCard'
import { t } from '../../shared/i18n'

const DAY = 86_400_000
/** Quantas conversas a lista mostra de cada vez (Fase 23); o resto vem no "Mostrar mais". */
const PAGE = 50

/** Em que grupo da lista a conversa entra, pela última atividade. */
function groupOf(updatedAt: number, today: number): string {
  if (updatedAt >= today) return t('Hoje')
  if (updatedAt >= today - DAY) return t('Ontem')
  if (updatedAt >= today - 6 * DAY) return t('Nesta semana')
  return t('Antes')
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
  const [limit, setLimit] = useState(PAGE)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
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
    setError(t('Não consegui abrir esta conversa: o arquivo dela sumiu ou está estragado.'))
    load()
  }

  async function remove(id: string): Promise<void> {
    setConfirming(null)
    if (!(await window.wisp.history.remove(id))) setError(t('Não consegui apagar esta conversa.'))
    load()
  }

  async function togglePin(item: ConversationSummary): Promise<void> {
    if (!(await window.wisp.history.pin(item.id, !item.pinned))) {
      setError(t('Não consegui guardar a conversa fixada.'))
    }
    load()
  }

  async function exportItem(item: ConversationSummary): Promise<void> {
    setError(null)
    setExported(null)
    const result = await window.wisp.history.exportMarkdown(item.id)
    if (!result) return
    if (result.ok) setExported(t('Exportada para {path}.', { path: result.path }))
    else setError(result.message)
  }

  const found = items?.filter((item) => fold(item.title).includes(fold(query.trim()))) ?? []
  const shown = found.slice(0, limit)
  // O título do grupo vai antes da primeira conversa de cada grupo.
  const groups = shown.map((item) => (item.pinned ? t('Fixadas') : groupOf(item.updatedAt, today)))

  return (
    <div className="history">
      <WeekCard />
      <label className="history-search">
        <SearchIcon />
        <input
          value={query}
          placeholder={t('Buscar conversas…')}
          aria-label={t('Buscar conversas')}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(PAGE)
          }}
        />
      </label>
      {error && (
        <div className="attach-error" role="alert">
          {error}
        </div>
      )}
      {exported && (
        <div className="history-exported" role="status">
          {exported}
        </div>
      )}
      <div className="history-list">
        {items === null ? null : found.length === 0 ? (
          <p className="history-empty">
            {items.length === 0
              ? t(
                  'Nenhuma conversa guardada ainda. Elas aparecem aqui a partir da primeira mensagem.'
                )
              : t('Nenhuma conversa com esse título.')}
          </p>
        ) : (
          shown.map((item, index) => {
            const heading = groups[index] !== groups[index - 1] ? groups[index] : null
            return (
              <div key={item.id}>
                {heading && <div className="history-group">{heading}</div>}
                {confirming === item.id ? (
                  <div className="history-item confirming">
                    <span className="history-title">
                      {t('Apagar “')}
                      {item.title}”?
                    </span>
                    <button type="button" className="danger" onClick={() => void remove(item.id)}>
                      {t('Apagar')}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      {t('Cancelar')}
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
                        <span className="history-badge">{t('aberta')}</span>
                      ) : (
                        <span className="history-when">{formatWhen(item.updatedAt)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`history-action history-pin${item.pinned ? ' on' : ''}`}
                      onClick={() => void togglePin(item)}
                      title={item.pinned ? t('Soltar do topo') : t('Fixar no topo')}
                      aria-label={
                        item.pinned
                          ? t('Soltar “{title}” do topo', { title: item.title })
                          : t('Fixar “{title}” no topo', { title: item.title })
                      }
                      aria-pressed={!!item.pinned}
                    >
                      <PinIcon />
                    </button>
                    <button
                      type="button"
                      className="history-action history-export"
                      onClick={() => void exportItem(item)}
                      title={t('Exportar em Markdown')}
                      aria-label={t('Exportar “{title}” em Markdown', { title: item.title })}
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      type="button"
                      className="history-delete"
                      onClick={() => setConfirming(item.id)}
                      title={t('Apagar do histórico')}
                      aria-label={t('Apagar “{title}” do histórico', { title: item.title })}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
        {found.length > shown.length && (
          <button
            type="button"
            className="load-earlier history-more"
            onClick={() => setLimit((count) => count + PAGE)}
          >
            {t('Mostrar mais (')}
            {found.length - shown.length})
          </button>
        )}
      </div>
    </div>
  )
}

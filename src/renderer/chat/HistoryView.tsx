import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { fold } from '../../shared/fold'
import { formatWhen } from '../../shared/format'
import type { ConversationSummary, HistoryHit } from '../../shared/ipc'
import { DownloadIcon, PinIcon, SearchIcon, TrashIcon } from './icons'
import { WeekCard } from './WeekCard'
import { t } from '../../shared/i18n'

const DAY = 86_400_000
/** Quantas conversas a lista mostra de cada vez (Fase 23); o resto vem no "Mostrar mais". */
const PAGE = 50
/** Quanto esperar o fim da digitação para buscar no que foi dito (ms). */
const SEARCH_MS = 200

/** O filtro de período (Fase 29), pela última atividade da conversa. */
type Period = 'all' | 'today' | 'week' | 'older'
const PERIODS: [Period, string][] = [
  ['all', t('Tudo')],
  ['today', t('Hoje')],
  ['week', t('Esta semana')],
  ['older', t('Antes')]
]
/** O filtro de pasta: todas, só as do Wisp (sem pasta) ou uma pasta. */
const ALL_FOLDERS = '*'
const NO_FOLDER = ''

function inPeriod(updatedAt: number, period: Period, today: number): boolean {
  if (period === 'today') return updatedAt >= today
  if (period === 'week') return updatedAt >= today - 6 * DAY
  if (period === 'older') return updatedAt < today - 6 * DAY
  return true
}

/** Em que grupo da lista a conversa entra, pela última atividade. */
function groupOf(updatedAt: number, today: number): string {
  if (updatedAt >= today) return t('Hoje')
  if (updatedAt >= today - DAY) return t('Ontem')
  if (updatedAt >= today - 6 * DAY) return t('Nesta semana')
  return t('Antes')
}

/**
 * As conversas guardadas: a mais recente primeiro, agrupadas por dia, com a busca no título e no
 * que foi dito (Fase 29) e os filtros por pasta e período. Abrir uma traz a conversa de volta para
 * o painel (achada pela busca, na mensagem do trecho); o Claude continua de onde parou.
 */
export function HistoryView({ onClose }: { onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [query, setQuery] = useState('')
  // A última busca no que foi dito, e para que texto ela foi.
  const [result, setResult] = useState<{ query: string; hits: HistoryHit[] } | null>(null)
  const [folder, setFolder] = useState(ALL_FOLDERS)
  const [period, setPeriod] = useState<Period>('all')
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

  // A busca no que foi dito sai quando a digitação para (e de novo se a lista mudou).
  const typed = query.trim()
  useEffect(() => {
    if (!typed) return
    let alive = true
    const timer = window.setTimeout(() => {
      void window.wisp.history.search(typed).then((hits) => {
        if (alive) setResult({ query: typed, hits })
      })
    }, SEARCH_MS)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [typed, items])

  async function open(item: ConversationSummary | HistoryHit): Promise<void> {
    // Aberta numa aba (talvez fora da vista): o main só mostra a aba dela. Achada pela busca, a
    // conversa abre na mensagem do trecho.
    const at = 'at' in item ? item.at : undefined
    if (await window.wisp.history.open(item.id, at)) return onClose()
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

  // Buscando: os resultados do main; até chegarem, as conversas com o texto no título (que
  // também estão nos resultados).
  const titled = items?.filter((item) => fold(item.title).includes(fold(typed))) ?? []
  const source: (ConversationSummary | HistoryHit)[] = !typed
    ? (items ?? [])
    : result?.query === typed
      ? result.hits
      : titled
  const found = source.filter(
    (item) =>
      inPeriod(item.updatedAt, period, today) &&
      (folder === ALL_FOLDERS || (item.folder ?? NO_FOLDER) === folder)
  )
  const shown = found.slice(0, limit)
  // As pastas das conversas, para o filtro (só aparece se alguma tem pasta).
  const folders = [
    ...new Map(
      (items ?? []).flatMap((item) => (item.folder ? [[item.folder, item.project ?? '']] : []))
    )
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const filtered = folder !== ALL_FOLDERS || period !== 'all'
  // O título do grupo vai antes da primeira conversa de cada grupo.
  const groups = shown.map((item) => (item.pinned ? t('Fixadas') : groupOf(item.updatedAt, today)))

  return (
    <div className="history">
      <WeekCard />
      <label className="history-search">
        <SearchIcon />
        <input
          value={query}
          placeholder={t('Buscar nas conversas…')}
          aria-label={t('Buscar conversas')}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(PAGE)
          }}
        />
      </label>
      <div className="history-filters">
        <div className="history-period" role="group" aria-label={t('Período')}>
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={period === value ? 'active' : ''}
              aria-pressed={period === value}
              onClick={() => {
                setPeriod(value)
                setLimit(PAGE)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {folders.length > 0 && (
          <select
            className="history-folder"
            value={folder}
            aria-label={t('Pasta')}
            onChange={(event) => {
              setFolder(event.target.value)
              setLimit(PAGE)
            }}
          >
            <option value={ALL_FOLDERS}>{t('Todas as pastas')}</option>
            <option value={NO_FOLDER}>{t('Sem pasta')}</option>
            {folders.map(([path, name]) => (
              <option key={path} value={path} title={path}>
                {name || path}
              </option>
            ))}
          </select>
        )}
      </div>
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
              : typed
                ? t('Nada encontrado nas conversas.')
                : filtered
                  ? t('Nenhuma conversa nesse filtro.')
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
                      className={`history-open${'snippet' in item && item.snippet ? ' with-snippet' : ''}`}
                      onClick={() => void open(item)}
                      title={item.folder ?? item.title}
                    >
                      {item.project && <span className="history-project">{item.project}</span>}
                      <span className="history-title">{item.title}</span>
                      {item.current ? (
                        <span className="history-badge">{t('aberta')}</span>
                      ) : (
                        <span className="history-when">{formatWhen(item.updatedAt)}</span>
                      )}
                      {'snippet' in item && item.snippet && (
                        <span className="history-snippet">
                          <span className="history-who">
                            {item.snippet.who === 'user' ? t('Você:') : t('Claude:')}
                          </span>{' '}
                          {item.snippet.before}
                          <mark>{item.snippet.match}</mark>
                          {item.snippet.after}
                          {item.matches > 1 && (
                            <span className="history-matches">
                              {' '}
                              {t('(+{count} mensagens)', { count: item.matches - 1 })}
                            </span>
                          )}
                        </span>
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

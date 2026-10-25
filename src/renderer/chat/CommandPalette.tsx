import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import type { ConversationSummary, FolderChoice, HistoryHit } from '../../shared/ipc'
import { t } from '../../shared/i18n'
import { rankPalette } from './palette'
import type { PaletteGroup, PaletteItem } from './palette'

/** O nome de cada grupo, ao lado do item. */
const GROUP_LABEL: Record<PaletteGroup, string> = {
  tab: t('Aba'),
  action: t('Ação'),
  prompt: t('Prompt'),
  task: t('Tarefa'),
  session: t('Sessão'),
  folder: t('Projeto'),
  conversation: t('Conversa'),
  found: t('Na conversa')
}

/** A partir de quantas letras a busca também olha o que foi dito nas conversas. */
const SEARCH_MIN = 3
const SEARCH_DELAY_MS = 150

/** O quando de uma conversa, curto: "hoje", "ontem" ou a data. */
function when(ms: number): string {
  const day = (time: number): number => new Date(time).setHours(0, 0, 0, 0)
  const days = Math.round((day(Date.now()) - day(ms)) / 86_400_000)
  if (days === 0) return t('hoje')
  if (days === 1) return t('ontem')
  return new Date(ms).toLocaleDateString()
}

/**
 * A paleta de comandos (Fase 32): uma caixa de busca sobre o painel. As setas escolhem, o Enter
 * faz, o Esc fecha. Além das ações que recebe, ela busca as conversas do histórico (pelo título
 * e, com 3 letras ou mais, pelo que foi dito) e os projetos.
 */
export function CommandPalette({
  actions,
  onClose
}: {
  actions: PaletteItem[]
  /** Fecha a paleta (`ran`: um item rodou). */
  onClose(ran: boolean): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [summaries, setSummaries] = useState<ConversationSummary[]>([])
  const [projects, setProjects] = useState<FolderChoice[]>([])
  const [hits, setHits] = useState<HistoryHit[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    input.current?.focus()
    let alive = true
    void window.wisp.history.list().then((items) => alive && setSummaries(items))
    void window.wisp.tabs.projects().then((items) => alive && setProjects(items))
    return () => {
      alive = false
    }
  }, [])

  // O que foi dito nas conversas: a busca do histórico (Fase 29), depois de parar de digitar.
  useEffect(() => {
    const text = query.trim()
    if (text.length < SEARCH_MIN) return
    let alive = true
    const timer = window.setTimeout(() => {
      void window.wisp.history.search(text).then((found) => alive && setHits(found))
    }, SEARCH_DELAY_MS)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query])

  const items = useMemo(() => {
    const open = (id: string, at?: HistoryHit['at']): void => void window.wisp.history.open(id, at)
    const conversations: PaletteItem[] = summaries.map((summary) => ({
      id: `conversation-${summary.id}`,
      group: 'conversation',
      title: summary.title,
      detail: [summary.project, when(summary.updatedAt)].filter(Boolean).join(' · '),
      run: () => open(summary.id)
    }))
    // Uma busca curta não olha o que foi dito (e os achados de antes não valem mais).
    const shown = query.trim().length < SEARCH_MIN ? [] : hits
    const found: PaletteItem[] = shown.flatMap((hit) =>
      hit.snippet
        ? [
            {
              id: `found-${hit.id}`,
              group: 'found' as const,
              title: hit.title,
              detail: `${hit.snippet.before}${hit.snippet.match}${hit.snippet.after}`,
              // A busca do histórico já achou as palavras no que foi dito.
              keywords: query,
              run: () => open(hit.id, hit.at)
            }
          ]
        : []
    )
    const folders: PaletteItem[] = projects.map((project) => ({
      id: `folder-${project.path}`,
      group: 'folder',
      title: t('Abrir {name} numa conversa', { name: project.name }),
      detail: project.display,
      keywords: t('projeto pasta'),
      run: () => void window.wisp.tabs.openFolder(project.path)
    }))
    const ranked = rankPalette([...actions, ...conversations, ...folders, ...found], query)
    // Uma conversa aparece uma vez: pelo título, se ele bate; senão, pelo trecho achado.
    const seen = new Set<string>()
    return ranked.filter((item) => {
      if (item.group !== 'conversation' && item.group !== 'found') return true
      const id = item.id.slice(item.id.indexOf('-') + 1)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [actions, summaries, projects, hits, query])

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (item: PaletteItem | undefined): void => {
    if (!item) return
    onClose(true)
    item.run()
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    // As teclas da paleta ficam nela: o Esc não fecha o painel, o Ctrl+K não recomeça a conversa.
    event.stopPropagation()
    const count = items.length
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose(false)
    } else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
      event.preventDefault()
      if (count) setSelected((index) => (index + 1) % count)
    } else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
      event.preventDefault()
      if (count) setSelected((index) => (index - 1 + count) % count)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(items[selected])
    } else if (event.key === 'Tab') {
      event.preventDefault()
    }
  }

  const active = items[selected]
  return (
    <div className="palette-backdrop" onMouseDown={() => onClose(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('Paleta de comandos')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={active ? `palette-${selected}` : undefined}
          aria-autocomplete="list"
          placeholder={t('Buscar ações, conversas, prompts…')}
          value={query}
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={onKey}
        />
        <ul ref={list} id="palette-list" className="palette-list" role="listbox">
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`palette-${index}`}
              data-index={index}
              data-item={item.id}
              role="option"
              aria-selected={index === selected}
              className={`palette-item${index === selected ? ' selected' : ''}`}
              onMouseMove={() => index !== selected && setSelected(index)}
              onClick={() => run(item)}
            >
              <span className="palette-main">
                <span className="palette-title">
                  {item.title}
                  {item.current && <span className="palette-current">{t('agora')}</span>}
                </span>
                {item.detail && <span className="palette-detail">{item.detail}</span>}
              </span>
              <span className="palette-meta">
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
                <span className="palette-group">{GROUP_LABEL[item.group]}</span>
              </span>
            </li>
          ))}
          {!items.length && (
            <li className="palette-empty" role="presentation">
              {t('Nada com “{query}”.', { query: query.trim() })}
            </li>
          )}
        </ul>
        <div className="palette-help" aria-hidden="true">
          {t('↑↓ escolhem · Enter faz · Esc fecha')}
        </div>
      </div>
    </div>
  )
}

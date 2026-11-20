// A sidebar da interface completa (Fase 88), com a estrutura do Claude desktop: o Wisp, a nova
// conversa, a busca, a navegação, as conversas recentes e os projetos; embaixo, as configurações e
// o alternar do modo. No modo completo ela fica fixa (e recolhe em ícones); no compacto, abre por
// cima da conversa.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Avatar } from './icons'
import {
  BoardIcon,
  HistoryIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  TerminalIcon,
  WorkbenchIcon
} from './icons'
import {
  ClockIcon,
  CompactIcon,
  ExpandIcon,
  HomeIcon,
  MemoryIcon,
  SidebarIcon,
  SparkIcon,
  UsageIcon
} from './icons-app'
import type { ConversationSummary, HistoryHit, MascotState, TabsState } from '../../shared/ipc'
import { fold } from '../../shared/fold'
import { PROJECT_TONES } from '../../shared/projects'
import { openSettingsAt } from './settings-categories'
import type { Project } from '../../shared/projects'
import { dateLocale, t } from '../../shared/i18n'

/** As telas que a sidebar abre. */
export type SidebarView =
  'home' | 'chat' | 'history' | 'board' | 'pentest' | 'memory' | 'sessions' | 'usage' | 'settings'

/** Quantas conversas recentes a sidebar mostra. */
const RECENT = 30

export interface SidebarProps {
  view: string
  onView: (view: SidebarView) => void
  tabs: TabsState
  mood: MascotState
  mode: 'compact' | 'full'
  /** Recolhida em ícones (modo completo). */
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  /** Quantos pedidos esperam nas sessões do terminal. */
  requests: number
  /** Os alertas críticos e altos do pentest que está rodando (Fase 100). */
  pentestAlerts?: number
  projects: Project[]
  workbenchOpen: boolean
  onWorkbench: () => void
  /** Fechar (no compacto, a sidebar por cima fecha depois de escolher). */
  onDone?: () => void
}

function NavItem({
  icon,
  label,
  active,
  badge,
  collapsed,
  onClick
}: {
  icon: ReactNode
  label: string
  active?: boolean
  badge?: number
  collapsed: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`sidebar-item${active ? ' active' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="sidebar-icon">{icon}</span>
      {!collapsed && <span className="sidebar-label">{label}</span>}
      {!!badge && <span className="badge">{badge}</span>}
    </button>
  )
}

/** "hoje", "ontem" ou a data curta. */
function when(at: number): string {
  const day = new Date(at)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (day.toDateString() === today.toDateString()) {
    return day.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  }
  if (day.toDateString() === yesterday.toDateString()) return t('ontem')
  return day.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { view, onView, tabs, collapsed, mode } = props
  const [recent, setRecent] = useState<ConversationSummary[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HistoryHit[] | null>(null)
  const search = useRef<HTMLInputElement>(null)

  // As recentes: relidas quando as abas mudam (uma conversa nova, uma que fechou).
  const tabsKey = tabs.tabs.map((tab) => `${tab.id}:${tab.title}`).join('|')
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      void window.wisp.history.list().then((list) => {
        if (alive) setRecent(list)
      })
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [tabsKey])

  // A busca pelo que foi dito (Fase 29), com duas letras ou mais, um instante depois de digitar.
  useEffect(() => {
    const wanted = query.trim()
    if (wanted.length < 2) return
    let alive = true
    const timer = setTimeout(() => {
      void window.wisp.history.search(wanted).then((found) => {
        if (alive) setHits(found)
      })
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const filtered = useMemo(() => {
    const wanted = fold(query.trim())
    const list = recent.filter((item) => !wanted || fold(item.title).includes(wanted))
    // As fixadas primeiro; depois, as mais recentes.
    return [...list].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt
    )
  }, [recent, query])

  const mainTab = tabs.tabs.find((tab) => tab.kind === 'chat' && tab.main)
  const go = (next: SidebarView): void => {
    onView(next)
    props.onDone?.()
  }
  const open = (id: string, at?: HistoryHit['at']): void => {
    void window.wisp.history.open(id, at)
    onView('chat')
    props.onDone?.()
  }
  // A busca pelo que foi dito só vale com duas letras ou mais.
  const found = query.trim().length >= 2 ? hits : null
  const shown: (ConversationSummary | HistoryHit)[] = found ?? filtered.slice(0, RECENT)

  return (
    <aside
      className={`sidebar${collapsed ? ' collapsed' : ''} sidebar-${mode}`}
      aria-label={t('Navegação')}
    >
      <div className="sidebar-top">
        <Avatar size={22} mood={props.mood} />
        {!collapsed && <strong className="sidebar-brand">Wisp</strong>}
        {mode === 'full' && (
          <button
            type="button"
            className="icon-button sidebar-collapse"
            onClick={() => props.onCollapse(!collapsed)}
            title={collapsed ? t('Abrir a barra lateral') : t('Recolher a barra lateral')}
            aria-label={collapsed ? t('Abrir a barra lateral') : t('Recolher a barra lateral')}
          >
            <SidebarIcon />
          </button>
        )}
      </div>

      <NavItem
        icon={<PlusIcon />}
        label={t('Nova conversa')}
        collapsed={collapsed}
        onClick={() => {
          window.wisp.tabs.create()
          go('chat')
        }}
      />
      {!collapsed ? (
        <label className="sidebar-search">
          <SearchIcon />
          <input
            ref={search}
            type="search"
            value={query}
            placeholder={t('Buscar conversas')}
            aria-label={t('Buscar conversas')}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && shown[0]) {
                const first = shown[0]
                open(first.id, 'at' in first ? first.at : undefined)
              }
            }}
          />
        </label>
      ) : (
        <NavItem
          icon={<SearchIcon />}
          label={t('Buscar conversas')}
          collapsed
          onClick={() => {
            props.onCollapse(false)
            requestAnimationFrame(() => search.current?.focus())
          }}
        />
      )}

      <nav className="sidebar-nav" aria-label={t('Telas')}>
        <NavItem
          icon={<HomeIcon />}
          label={t('Início')}
          active={view === 'home'}
          collapsed={collapsed}
          onClick={() => go('home')}
        />
        <NavItem
          icon={<SparkIcon />}
          label="Wisp"
          active={view === 'chat' && !!mainTab && tabs.panes[tabs.focused] === mainTab.id}
          collapsed={collapsed}
          onClick={() => {
            if (mainTab) window.wisp.tabs.show(mainTab.id)
            go('chat')
          }}
        />
        <NavItem
          icon={<HistoryIcon />}
          label={t('Conversas')}
          active={view === 'history'}
          collapsed={collapsed}
          onClick={() => go('history')}
        />
        <NavItem
          icon={<BoardIcon />}
          label={t('Quadro de tarefas')}
          active={view === 'board'}
          collapsed={collapsed}
          onClick={() => go('board')}
        />
        <NavItem
          icon={<ShieldIcon />}
          label={t('Pentest')}
          active={view === 'pentest'}
          badge={props.pentestAlerts}
          collapsed={collapsed}
          onClick={() => go('pentest')}
        />
        <NavItem
          icon={<MemoryIcon />}
          label={t('Memória')}
          active={view === 'memory'}
          collapsed={collapsed}
          onClick={() => go('memory')}
        />
        <NavItem
          icon={<TerminalIcon />}
          label={t('Sessões do terminal')}
          active={view === 'sessions'}
          badge={props.requests}
          collapsed={collapsed}
          onClick={() => go('sessions')}
        />
        <NavItem
          icon={<UsageIcon />}
          label={t('Uso do plano')}
          active={view === 'usage'}
          collapsed={collapsed}
          onClick={() => go('usage')}
        />
        <NavItem
          icon={<WorkbenchIcon />}
          label={t('Bancada')}
          active={view === 'chat' && props.workbenchOpen}
          collapsed={collapsed}
          onClick={() => {
            props.onWorkbench()
            props.onDone?.()
          }}
        />
      </nav>

      {!collapsed && (
        <div className="sidebar-lists">
          {props.projects.length > 0 && !query && (
            <section className="sidebar-section" aria-label={t('Projetos')}>
              <h3>{t('Projetos')}</h3>
              {props.projects.map((project) => (
                <button
                  key={project.folder}
                  type="button"
                  className="sidebar-row"
                  title={project.folder}
                  onClick={() => {
                    void window.wisp.tabs.openFolder(project.folder, false)
                    go('chat')
                  }}
                >
                  <span
                    className="sidebar-dot"
                    style={{ background: PROJECT_TONES[project.color] }}
                    aria-hidden
                  />
                  <span className="sidebar-row-title">{project.name}</span>
                </button>
              ))}
            </section>
          )}
          <section className="sidebar-section" aria-label={t('Recentes')}>
            <h3>
              {found
                ? t('{count} conversas com "{query}"', { count: found.length, query: query.trim() })
                : t('Recentes')}
            </h3>
            {shown.map((item) => {
              const snippet = 'snippet' in item ? item.snippet : null
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-row${item.current ? ' open' : ''}`}
                  title={item.folder ?? item.title}
                  onClick={() => open(item.id, 'at' in item ? item.at : undefined)}
                >
                  {item.pinned && <span className="sidebar-pin" aria-label={t('fixada')} />}
                  <span className="sidebar-row-text">
                    <span className="sidebar-row-title">
                      {item.main ? `Wisp · ${item.title}` : item.title}
                    </span>
                    {snippet && (
                      <span className="sidebar-snippet">
                        {snippet.before}
                        <mark>{snippet.match}</mark>
                        {snippet.after}
                      </span>
                    )}
                  </span>
                  <span className="sidebar-when">{when(item.updatedAt)}</span>
                </button>
              )
            })}
            {!shown.length && (
              <p className="sidebar-empty">
                {query ? t('Nada achado.') : t('As conversas aparecem aqui.')}
              </p>
            )}
          </section>
        </div>
      )}

      <div className="sidebar-foot">
        <NavItem
          icon={<ClockIcon />}
          label={t('Tarefas agendadas')}
          collapsed={collapsed}
          onClick={() => {
            openSettingsAt('assistente')
            go('settings')
          }}
        />
        <NavItem
          icon={<SettingsIcon />}
          label={t('Configurações')}
          active={view === 'settings'}
          collapsed={collapsed}
          onClick={() => go('settings')}
        />
        <NavItem
          icon={mode === 'full' ? <CompactIcon /> : <ExpandIcon />}
          label={mode === 'full' ? t('Painel compacto') : t('Janela completa')}
          collapsed={collapsed}
          onClick={() => window.wisp.chat.setWindowMode(mode === 'full' ? 'compact' : 'full')}
        />
      </div>
    </aside>
  )
}

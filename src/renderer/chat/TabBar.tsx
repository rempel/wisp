import type { JSX } from 'react'
import { MAX_PANES } from '../../shared/ipc'
import type { TabsState } from '../../shared/ipc'
import { CloseIcon, PlusIcon, SplitIcon, TerminalIcon } from './icons'

/** O que o pontinho da aba mostra. */
export type TabStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

const STATUS_LABEL: Record<TabStatus, string> = {
  idle: '',
  working: 'trabalhando',
  waiting: 'esperando você',
  done: 'resposta nova',
  error: 'com erro'
}

/**
 * As abas: cada conversa (e cada sessão do terminal aberta numa aba) com um pontinho do que
 * está acontecendo nela. As que estão à vista ficam marcadas; a do painel em foco, destacada.
 */
export function TabBar({
  state,
  statuses
}: {
  state: TabsState
  statuses: Map<string, TabStatus>
}): JSX.Element {
  const focusedId = state.panes[state.focused]
  return (
    <nav className="tabs" aria-label="Abas">
      <div className="tabs-list" role="tablist">
        {state.tabs.map((tab, index) => {
          const status = statuses.get(tab.id) ?? 'idle'
          const visible = state.panes.includes(tab.id)
          const active = tab.id === focusedId
          const label = STATUS_LABEL[status]
          return (
            <div
              key={tab.id}
              className={`tab tab-${status}${visible ? ' visible' : ''}${active ? ' active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="tab-main"
                onClick={() => window.wisp.tabs.show(tab.id)}
                title={`${tab.title}${label ? ` (${label})` : ''}${index < 9 ? ` · Ctrl+${index + 1}` : ''}`}
              >
                {tab.kind === 'session' ? (
                  <TerminalIcon />
                ) : (
                  <span className="tab-dot" aria-hidden />
                )}
                <span className="tab-title">{tab.title}</span>
                {label && <span className="sr-only">({label})</span>}
              </button>
              <button
                type="button"
                className="tab-close"
                onClick={() => window.wisp.tabs.close(tab.id)}
                title={tab.kind === 'chat' ? 'Fechar a aba (Ctrl+W)' : 'Fechar a aba'}
                aria-label={`Fechar ${tab.title}`}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="icon-button tabs-new"
        onClick={() => window.wisp.tabs.create()}
        title="Nova conversa numa aba (Ctrl+T)"
        aria-label="Nova conversa numa aba"
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className="icon-button tabs-split"
        onClick={() => window.wisp.tabs.split()}
        disabled={state.panes.length >= MAX_PANES}
        title={
          state.panes.length >= MAX_PANES
            ? `No máximo ${MAX_PANES} painéis lado a lado`
            : 'Dividir: mais um painel lado a lado (Ctrl+\\)'
        }
        aria-label="Dividir a janela"
      >
        <SplitIcon />
      </button>
    </nav>
  )
}

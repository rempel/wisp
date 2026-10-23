import type { JSX } from 'react'
import { MAX_PANES } from '../../shared/ipc'
import type { TabsState } from '../../shared/ipc'
import { TAB_DRAG_TYPE } from '../../shared/layout'
import { FolderMenu } from './FolderMenu'
import { CloseIcon, FolderIcon, PlusIcon, SplitIcon, TerminalIcon } from './icons'
import { t } from '../../shared/i18n'

/** O que o pontinho da aba mostra. */
export type TabStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

const STATUS_LABEL: Record<TabStatus, string> = {
  idle: '',
  working: t('trabalhando'),
  waiting: t('esperando você'),
  done: t('resposta nova'),
  error: t('com erro')
}

/**
 * As abas: cada conversa (e cada sessão do terminal aberta numa aba) com um pontinho do que
 * está acontecendo nela. As que estão à vista ficam marcadas; a do painel em foco, destacada.
 */
export function TabBar({
  state,
  statuses,
  onDragTab
}: {
  state: TabsState
  statuses: Map<string, TabStatus>
  /** Uma aba começou (ou parou) de ser arrastada, para os painéis mostrarem onde ela cai. */
  onDragTab: (tab: string | null) => void
}): JSX.Element {
  const focusedId = state.panes[state.focused]
  return (
    <nav className="tabs" aria-label={t('Abas')}>
      <div className="tabs-list" role="tablist">
        {state.tabs.map((tab, index) => {
          const status = statuses.get(tab.id) ?? 'idle'
          const visible = state.panes.includes(tab.id)
          const active = tab.id === focusedId
          const label = STATUS_LABEL[status]
          return (
            <div
              key={tab.id}
              data-tab={tab.id}
              className={`tab tab-${status}${visible ? ' visible' : ''}${active ? ' active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="tab-main"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
                  event.dataTransfer.effectAllowed = 'move'
                  onDragTab(tab.id)
                }}
                onDragEnd={() => onDragTab(null)}
                onClick={() => window.wisp.tabs.show(tab.id)}
                title={`${tab.title}${tab.kind === 'chat' && tab.folder ? ` · ${tab.folder}` : ''}${label ? ` (${label})` : ''}${index < 9 ? t(' · Ctrl+{v1}', { v1: index + 1 }) : ''}`}
              >
                {tab.kind === 'session' ? (
                  <TerminalIcon />
                ) : (
                  <span className="tab-dot" aria-hidden />
                )}
                {tab.kind === 'chat' && tab.folder && (
                  <span className="tab-folder" aria-hidden>
                    <FolderIcon />
                  </span>
                )}
                <span className="tab-title">{tab.title}</span>
                {label && <span className="sr-only">({label})</span>}
              </button>
              <button
                type="button"
                className="tab-close"
                onClick={() => window.wisp.tabs.close(tab.id)}
                title={tab.kind === 'chat' ? t('Fechar a aba (Ctrl+W)') : t('Fechar a aba')}
                aria-label={t('Fechar {title}', { title: tab.title })}
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
        title={t('Nova conversa numa aba (Ctrl+T)')}
        aria-label={t('Nova conversa numa aba')}
      >
        <PlusIcon />
      </button>
      <FolderMenu />
      <button
        type="button"
        className="icon-button tabs-split"
        onClick={() => window.wisp.tabs.split()}
        disabled={state.panes.length >= MAX_PANES}
        title={
          state.panes.length >= MAX_PANES
            ? t('No máximo {MAX_PANES} painéis lado a lado', { MAX_PANES })
            : t(
                'Dividir: mais um painel ao lado (Ctrl+\\; embaixo, Ctrl+Shift+\\). Arraste uma aba para a borda de um painel para dividir ali.'
              )
        }
        aria-label={t('Dividir a janela')}
      >
        <SplitIcon />
      </button>
    </nav>
  )
}

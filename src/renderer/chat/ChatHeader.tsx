// O cabeçalho do painel (separado do Chat.tsx, Fase 87): o título da tela (ou o Wisp e o que ele
// está fazendo), o uso do plano, a faixa de ícones do modo compacto, o alternar do modo e os
// botões da janela.
import type { JSX } from 'react'
import type { MascotState, PlanUsage, WindowState } from '../../shared/ipc'
import { CostPill } from './CostPill'
import {
  Avatar,
  BackIcon,
  BoardIcon,
  CloseIcon,
  DemoIcon,
  DockIcon,
  HistoryIcon,
  MaximizeIcon,
  RestoreIcon,
  SettingsIcon,
  TerminalIcon,
  WorkbenchIcon
} from './icons'
import { CompactIcon, ExpandIcon, SidebarIcon } from './icons-app'
import { statusText } from './state'
import type { ChatState } from './state'
import { UsagePill } from './UsagePill'
import { toggleWorkbench } from './workbench-store'
import type { useWorkbench } from './workbench-store'
import { t } from '../../shared/i18n'

/** O título e a linha de baixo do cabeçalho de cada tela. */
const VIEW_TITLES: Record<string, [string, string]> = {
  home: [t('Início'), t('o seu dia num lugar só')],
  history: [t('Conversas'), t('guardadas neste computador')],
  settings: [t('Configurações'), t('gravadas no config.json')],
  sessions: [t('Sessões'), t('do Claude Code no terminal')],
  diagnostics: [t('Diagnóstico'), t('o que o Wisp precisa e o que está ligado')],
  welcome: [t('Primeiros passos'), t('uma coisa de cada vez')],
  usage: [t('Uso'), t('tokens e custo, das sessões do Claude Code nesta máquina')],
  agents: [t('Subagentes'), t('os ajudantes que o Claude chama sozinho')],
  memory: [t('Memória'), t('o que o Claude lê antes de cada conversa')],
  board: [t('Quadro de tarefas'), t('cada cartão numa cópia do projeto')]
}

/** As telas do painel. */
export type ChatView =
  | 'home'
  | 'chat'
  | 'history'
  | 'sessions'
  | 'settings'
  | 'diagnostics'
  | 'welcome'
  | 'usage'
  | 'agents'
  | 'memory'
  | 'board'

export function ChatHeader({
  view,
  setView,
  mood,
  focusedState,
  demo,
  usage,
  requests,
  workbench,
  windowState,
  onDrawer
}: {
  view: ChatView
  setView: (next: ChatView | ((current: ChatView) => ChatView)) => void
  mood: MascotState
  focusedState: ChatState | null | undefined
  demo: boolean
  usage: PlanUsage | null
  requests: number
  workbench: ReturnType<typeof useWorkbench>
  windowState: WindowState
  /** No compacto: abre a sidebar por cima (Fase 88). */
  onDrawer: () => void
}): JSX.Element {
  const full = windowState.mode === 'full'
  return (
    <header className="header">
      {view !== 'chat' ? (
        <>
          {!full && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setView('chat')}
              title={t('Voltar para a conversa (Esc)')}
              aria-label={t('Voltar para a conversa')}
            >
              <BackIcon />
            </button>
          )}
          <div className="title">
            <strong>{VIEW_TITLES[view][0]}</strong>
            <span className="status">{VIEW_TITLES[view][1]}</span>
          </div>
        </>
      ) : (
        <>
          <Avatar size={26} mood={mood} />
          <div className="title">
            <strong>Wisp</strong>
            <span className={`status${focusedState?.busy ? ' busy' : ''}`}>
              {focusedState ? statusText(focusedState) : t('sessão do terminal')}
            </span>
          </div>
        </>
      )}
      {demo && (
        <button
          type="button"
          className="demo-pill"
          onClick={() => void window.wisp.settings.set({ demo: false })}
          title={t(
            'Modo demonstração: as respostas são gravadas, e nada roda de verdade. Clique para desligar.'
          )}
          aria-label={t('Modo demonstração (clique para desligar)')}
        >
          <DemoIcon />
          {t('Demo')}
        </button>
      )}
      {!demo &&
        (focusedState?.provider === 'openrouter' ? (
          <CostPill cost={focusedState.cost} />
        ) : (
          usage && <UsagePill usage={usage} onPanel={() => setView('usage')} />
        ))}
      {/* A navegação fica numa barra à esquerda (o CSS a põe lá); o cabeçalho fica com o título. */}
      <nav className="header-nav" aria-label={t('Telas do painel')}>
        {!full && (
          <button
            type="button"
            className="icon-button"
            onClick={onDrawer}
            title={t('Abrir a barra lateral: a busca, as recentes e os projetos')}
            aria-label={t('Abrir a barra lateral')}
          >
            <SidebarIcon />
          </button>
        )}
        <button
          type="button"
          className={`icon-button badge-host${view === 'sessions' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'sessions' ? 'chat' : 'sessions'))}
          title={
            requests
              ? t('Sessões do terminal ({requests} {v2})', {
                  requests,
                  v2: requests === 1 ? t('pedido') : t('pedidos')
                })
              : t('Sessões do Claude Code no terminal')
          }
          aria-label={t('Sessões do terminal')}
          aria-pressed={view === 'sessions'}
        >
          <TerminalIcon />
          {requests > 0 && <span className="badge">{requests}</span>}
        </button>
        <button
          type="button"
          className={`icon-button${view === 'board' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'board' ? 'chat' : 'board'))}
          title={t('Quadro de tarefas')}
          aria-label={t('Quadro de tarefas')}
          aria-pressed={view === 'board'}
        >
          <BoardIcon />
        </button>
        <button
          type="button"
          className={`icon-button${view === 'history' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'history' ? 'chat' : 'history'))}
          title={t('Conversas anteriores')}
          aria-label={t('Conversas anteriores')}
          aria-pressed={view === 'history'}
        >
          <HistoryIcon />
        </button>
        <button
          type="button"
          className={`icon-button workbench-toggle nav-end${view === 'chat' && workbench?.open ? ' active' : ''}`}
          onClick={() => {
            if (view !== 'chat') setView('chat')
            if (view === 'chat' || !workbench?.open) toggleWorkbench(workbench)
          }}
          title={t('Bancada: navegador e terminal ao lado da conversa (Ctrl+Shift+B)')}
          aria-label={t('Bancada: navegador e terminal')}
          aria-pressed={view === 'chat' && !!workbench?.open}
        >
          <WorkbenchIcon />
        </button>
        <button
          type="button"
          className={`icon-button${view === 'settings' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'settings' ? 'chat' : 'settings'))}
          title={t('Configurações')}
          aria-label={t('Configurações')}
          aria-pressed={view === 'settings'}
        >
          <SettingsIcon />
        </button>
      </nav>
      {!full && windowState.detached && !windowState.maximized && (
        <button
          type="button"
          className="icon-button window-dock"
          onClick={() => window.wisp.chat.dock()}
          title={t('Voltar para perto do mascote')}
          aria-label={t('Voltar para perto do mascote')}
        >
          <DockIcon />
        </button>
      )}
      <button
        type="button"
        className="icon-button window-mode"
        onClick={() => window.wisp.chat.setWindowMode(full ? 'compact' : 'full')}
        title={full ? t('Voltar ao painel compacto') : t('Abrir a janela completa')}
        aria-label={full ? t('Voltar ao painel compacto') : t('Abrir a janela completa')}
      >
        {full ? <CompactIcon /> : <ExpandIcon />}
      </button>
      <button
        type="button"
        className="icon-button window-maximize"
        onClick={() => window.wisp.chat.maximize()}
        title={windowState.maximized ? t('Restaurar') : t('Maximizar')}
        aria-label={windowState.maximized ? t('Restaurar') : t('Maximizar')}
      >
        {windowState.maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => window.wisp.chat.hide()}
        title={t('Fechar (Esc)')}
        aria-label={t('Fechar')}
      >
        <CloseIcon />
      </button>
    </header>
  )
}

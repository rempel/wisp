// As ações do Wisp na paleta de comandos (Fase 32): as do painel, os modos e os modelos da
// conversa em foco, as telas e o idioma; e as abas, os prompts salvos, as tarefas e as sessões
// do terminal. Cada uma faz o mesmo que o atalho, o botão ou o menu dela.

import { MODEL_CHOICES, PERMISSION_MODES } from '../../shared/ipc'
import type {
  ConversationView,
  ExternalSession,
  PermissionMode,
  Provider,
  SettingsSnapshot,
  TabInfo
} from '../../shared/ipc'
import { promptPreview } from '../../shared/prompts'
import { t } from '../../shared/i18n'
import { MODE_TEXT } from './modes'
import type { PaletteItem } from './palette'

/** As telas do painel que a paleta abre. */
export type PaletteView = 'history' | 'sessions' | 'settings' | 'diagnostics'

export interface PaletteContext {
  /** A conversa da aba em foco (null: uma sessão do terminal, ou nenhuma). */
  conversation: string | null
  /** O que se sabe dela: o modo, o provedor e se mostra o chat ou o terminal. */
  state: { mode: PermissionMode; provider: Provider; view: ConversationView } | null
  tabs: TabInfo[]
  /** A aba em foco. */
  focusedTab: string | null
  settings: SettingsSnapshot | null
  sessions: ExternalSession[]
  /** Os sons estão ligados (null: ainda não se sabe). */
  sound: boolean | null
  /** Pode dividir o painel em foco (ainda cabe outro). */
  canSplit: boolean
  setView(view: PaletteView): void
  find(conversation: string): void
  exportMarkdown(conversation: string): void
  toggleSound(): void
  /** Põe um prompt salvo, preenchido, na caixa da conversa (para revisar e mandar). */
  usePrompt(conversation: string, name: string): void
  /** Um aviso na conversa em foco (ou no histórico, se não houver). */
  notice(text: string, warning?: boolean): void
}

const MODEL_NAMES: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  fable: 'Fable'
}

/** As ações da conversa em foco: recomeçar, buscar, exportar, compactar, o modo e o modelo. */
function conversationActions(ctx: PaletteContext, conversation: string): PaletteItem[] {
  const api = window.wisp
  const items: PaletteItem[] = [
    {
      id: 'new',
      group: 'action',
      title: t('Nova conversa'),
      shortcut: 'Ctrl+K',
      keywords: 'clear recomeçar limpar',
      run: () => api.chat.newConversation(conversation)
    },
    {
      id: 'find',
      group: 'action',
      title: t('Buscar na conversa'),
      shortcut: 'Ctrl+F',
      run: () => ctx.find(conversation)
    },
    {
      id: 'export',
      group: 'action',
      title: t('Exportar a conversa em Markdown'),
      shortcut: 'Ctrl+Shift+E',
      run: () => ctx.exportMarkdown(conversation)
    },
    {
      id: 'compact',
      group: 'action',
      title: t('Compactar a conversa'),
      keywords: '/compact contexto',
      run: () => api.chat.compact(conversation)
    }
  ]
  const state = ctx.state
  if (!state) return items
  items.push(
    state.view === 'terminal'
      ? {
          id: 'view-chat',
          group: 'action',
          title: t('Ver a conversa no chat'),
          run: () => api.chat.setView(conversation, 'chat')
        }
      : {
          id: 'view-terminal',
          group: 'action',
          title: t('Ver a conversa no terminal'),
          keywords: 'tui claude code',
          run: () => api.chat.setView(conversation, 'terminal')
        }
  )
  for (const mode of PERMISSION_MODES) {
    items.push({
      id: `mode-${mode}`,
      group: 'action',
      title: t('Modo: {mode}', { mode: MODE_TEXT[mode].label }),
      detail: MODE_TEXT[mode].hint,
      keywords: t('permissão'),
      current: state.mode === mode,
      run: () => api.chat.setMode(conversation, mode)
    })
  }
  // Pela OpenRouter, os modelos são os de lá (a pílula do modelo escolhe).
  if (state.provider === 'subscription') {
    items.push({
      id: 'model-default',
      group: 'action',
      title: t('Modelo: o padrão'),
      run: () => api.chat.setModel(conversation, null)
    })
    for (const model of MODEL_CHOICES) {
      items.push({
        id: `model-${model}`,
        group: 'action',
        title: t('Modelo: {model}', { model: MODEL_NAMES[model] ?? model }),
        run: () => api.chat.setModel(conversation, model)
      })
    }
  }
  return items
}

/** Todas as ações e os itens que a paleta já tem à mão (sem as conversas e os projetos). */
export function paletteActions(ctx: PaletteContext): PaletteItem[] {
  const api = window.wisp
  const items: PaletteItem[] = []
  for (const tab of ctx.tabs) {
    if (tab.id === ctx.focusedTab) continue
    items.push({
      id: `tab-${tab.id}`,
      group: 'tab',
      title: t('Ir para a aba: {title}', { title: tab.title }),
      detail: tab.kind === 'chat' ? tab.folder : t('sessão do terminal'),
      run: () => api.tabs.show(tab.id)
    })
  }
  if (ctx.conversation) items.push(...conversationActions(ctx, ctx.conversation))
  items.push(
    {
      id: 'tab-new',
      group: 'action',
      title: t('Nova aba'),
      shortcut: 'Ctrl+T',
      run: () => api.tabs.create()
    },
    {
      id: 'folder',
      group: 'action',
      title: t('Abrir uma pasta numa conversa…'),
      keywords: t('projeto diretório'),
      run: () => void api.tabs.openFolder(null)
    }
  )
  if (ctx.focusedTab) {
    const tab = ctx.focusedTab
    items.push({
      id: 'tab-close',
      group: 'action',
      title: t('Fechar a aba'),
      shortcut: 'Ctrl+W',
      run: () => api.tabs.close(tab)
    })
  }
  if (ctx.canSplit) {
    items.push(
      {
        id: 'split-row',
        group: 'action',
        title: t('Dividir o painel ao lado'),
        shortcut: 'Ctrl+\\',
        run: () => api.tabs.split('row')
      },
      {
        id: 'split-column',
        group: 'action',
        title: t('Dividir o painel embaixo'),
        shortcut: 'Ctrl+Shift+\\',
        run: () => api.tabs.split('column')
      }
    )
  }
  const views: [PaletteView, string, string?][] = [
    ['history', t('Conversas anteriores'), t('histórico')],
    ['sessions', t('Sessões do terminal'), 'hooks'],
    ['settings', t('Configurações'), t('preferências opções')],
    ['diagnostics', t('Diagnóstico'), t('problemas versão')]
  ]
  for (const [view, title, keywords] of views) {
    items.push({
      id: `view-${view}`,
      group: 'action',
      title,
      keywords,
      run: () => ctx.setView(view)
    })
  }
  if (ctx.sound !== null) {
    items.push({
      id: 'sound',
      group: 'action',
      title: ctx.sound ? t('Desligar os sons') : t('Ligar os sons'),
      shortcut: 'Ctrl+M',
      keywords: t('mudo som'),
      run: () => ctx.toggleSound()
    })
  }
  const locale = ctx.settings?.nextLocale
  for (const [language, title] of [
    ['pt', 'Português (Brasil)'],
    ['en', 'English']
  ] as const) {
    if (!ctx.settings) break
    items.push({
      id: `language-${language}`,
      group: 'action',
      title: t('Idioma: {language}', { language: title }),
      keywords: 'language idioma',
      current: locale === language,
      run: () =>
        void api.settings.set({ language }).then((result) => {
          if (!result.ok) return ctx.notice(result.message, true)
          if (ctx.settings?.locale !== language) {
            ctx.notice(t('O idioma muda quando o Wisp abrir de novo.'))
          }
        })
    })
  }
  const conversation = ctx.conversation
  for (const prompt of ctx.settings?.values.prompts ?? []) {
    if (!conversation) break
    items.push({
      id: `prompt-${prompt.name}`,
      group: 'prompt',
      title: `/${prompt.name}`,
      detail: promptPreview(prompt.text),
      keywords: t('prompt salvo'),
      run: () => ctx.usePrompt(conversation, prompt.name)
    })
  }
  for (const task of ctx.settings?.values.scheduledTasks ?? []) {
    items.push({
      id: `task-${task.id}`,
      group: 'task',
      title: t('Rodar agora: {name}', { name: task.name }),
      detail: t('tarefa agendada, às {time}', { time: task.time }),
      keywords: t('tarefa agendada'),
      run: () =>
        void api.settings.runTask(task.id).then((result) => {
          if (!result.ok) ctx.notice(result.message, true)
        })
    })
  }
  for (const session of ctx.sessions) {
    items.push({
      id: `session-${session.id}`,
      group: 'session',
      title: t('Abrir a sessão do terminal: {project}', { project: session.project }),
      detail: session.prompt,
      keywords: t('sessão terminal'),
      run: () => api.tabs.openSession(session.id)
    })
  }
  return items
}

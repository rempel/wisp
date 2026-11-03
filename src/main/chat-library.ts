// O que o painel pede sobre as conversas guardadas e o que fica em volta delas: o histórico
// (listar, abrir numa aba, apagar, fixar), exportar em Markdown, abrir uma pasta ou um projeto
// numa conversa nova e expandir um prompt salvo (Fase 26).

import { setupWorktrees } from './worktrees-ipc'
import { app, clipboard, ipcMain } from 'electron'
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChatTabs } from './chat-tabs'
import { getConfig } from './config'
import type { Conversation } from './conversation'
import { listProjects } from './desktop'
import { exportFileName, exportMarkdown } from './export'
import { setPinned } from './history'
import type { History, SavedConversation } from './history'
import { checkTarget, SearchIndex } from './history-search'
import { tilde, usableFolder } from './folders'
import { pickFolder, pickSaveFile } from './pick'
import { IPC } from '../shared/ipc'
import type {
  ChatEvent,
  ExportResult,
  FolderChoice,
  FolderResult,
  PermissionMode,
  Provider
} from '../shared/ipc'
import { dateLocale, t } from '../shared/i18n'
import { expandPrompt, MAX_CLIPBOARD, usesClipboard } from '../shared/prompts'
import type { PromptValues } from '../shared/prompts'

export interface LibraryContext {
  /** O IPC veio da página do painel? */
  fromChat(event: IpcMainEvent | IpcMainInvokeEvent): boolean
  /** A janela do painel (para os diálogos do sistema), se existe. */
  window(): BrowserWindow | null
  /** O histórico (só lê, lista e apaga: cada conversa grava a sua). */
  store: History
  tabs: ChatTabs
  /** Manda um evento de uma conversa para a página. */
  toPage(conversation: string, event: ChatEvent): void
  makeConversation(mode?: PermissionMode, provider?: Provider, folder?: string | null): Conversation
  /** Mostra o painel. */
  show(): void
}

/** O que preenche as variáveis de um prompt salvo (Fase 26). */
export function promptValues(folder: string | null, copied = ''): PromptValues {
  const now = new Date()
  return {
    folder: folder ?? homedir(),
    clipboard: copied.slice(0, MAX_CLIPBOARD),
    date: now.toLocaleDateString(dateLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }),
    time: now.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  }
}

/** Devolve o índice da busca, para o app fechar com ele gravado. */
export function registerLibrary(ctx: LibraryContext): SearchIndex {
  const { fromChat, store, tabs, toPage } = ctx
  const conversations = (): Conversation[] => tabs.conversations()
  const win = (): BrowserWindow | null => ctx.window()
  const index = new SearchIndex(store)
  const openIds = (): Set<string> =>
    new Set(conversations().flatMap((c) => (c.historyId ? [c.historyId] : [])))

  /** Exporta uma conversa guardada: o diálogo do sistema escolhe onde. */
  const exportConversation = async (saved: SavedConversation | null): Promise<ExportResult> => {
    if (!saved) return { ok: false, message: t('Esta conversa ainda não tem mensagens guardadas.') }
    const file = await pickSaveFile(
      t('Exportar a conversa'),
      join(app.getPath('documents'), exportFileName(saved.title)),
      [{ name: 'Markdown', extensions: ['md'] }],
      win()
    )
    if (!file) return null
    try {
      writeFileSync(file, exportMarkdown(saved))
    } catch (err) {
      return {
        ok: false,
        message: t('Não consegui gravar o arquivo: {message}', { message: (err as Error).message })
      }
    }
    return { ok: true, path: tilde(file) }
  }
  ipcMain.handle(IPC.chatExport, (event, id: unknown) => {
    const conversation =
      typeof id === 'string' && fromChat(event) ? tabs.conversationById(id) : undefined
    if (!conversation) return null
    const historyId = conversation.historyId
    return exportConversation(historyId ? conversation.history.load(historyId) : null)
  })
  ipcMain.handle(IPC.historyExport, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return null
    const open = conversations().find((conversation) => conversation.historyId === id)
    return exportConversation(open ? open.history.load(id) : store.load(id))
  })
  ipcMain.handle(IPC.historyPin, (event, id: unknown, pinned: unknown) => {
    if (!fromChat(event) || typeof id !== 'string' || typeof pinned !== 'boolean') return false
    return setPinned(id, pinned)
  })
  ipcMain.handle(IPC.historyList, (event) => (fromChat(event) ? store.list(openIds()) : []))
  ipcMain.handle(IPC.historySearch, (event, query: unknown) => {
    if (!fromChat(event) || typeof query !== 'string') return []
    return index.search(query.slice(0, 200), store.list(openIds()))
  })
  ipcMain.handle(IPC.historyOpen, (event, id: unknown, at: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    const target = checkTarget(at)
    // Já aberta numa aba: só mostra (e, pela busca, vai à mensagem).
    const open = conversations().find((conversation) => conversation.historyId === id)
    if (open) {
      tabs.show(open.id)
      if (target) toPage(open.id, { type: 'jump', target })
      return true
    }
    const saved = store.load(id)
    if (!saved) return false
    if (tabs.full && !tabs.emptyFocused()) return false
    const conversation = tabs.fresh()
    // A conversa da aba recomeça (o 'reset' passa pelo histórico e pelos cards) e a guardada
    // volta: primeiro o que o painel mostrava, depois a próxima mensagem retoma o Claude Code.
    for (const replayed of conversation.restore(saved)) toPage(conversation.id, replayed)
    if (target) toPage(conversation.id, { type: 'jump', target })
    tabs.show(conversation.id)
    return true
  })
  ipcMain.handle(IPC.historyDelete, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    const open = conversations().find((conversation) => conversation.historyId === id)
    const removed = open ? open.history.remove(id) : store.remove(id)
    // O que foi dito nela sai também do índice da busca, na hora.
    if (removed) index.forget(id)
    // Apagar a conversa aberta numa aba é recomeçar a aba.
    open?.reset()
    return removed
  })
  // As cópias do Git (Fase 43): as guardadas, sem aba, entram na lista para reabrir.
  const copies = setupWorktrees({ fromChat, tabs })
  const projects = (): FolderChoice[] => [
    ...listProjects(getConfig().projectRoots).map(({ nome, caminho }) => ({
      name: nome,
      display: tilde(caminho),
      path: caminho
    })),
    ...copies.saved()
  ]
  ipcMain.handle(IPC.tabsProjects, (event): FolderChoice[] => (fromChat(event) ? projects() : []))
  ipcMain.handle(
    IPC.tabsOpenFolder,
    async (event, path: unknown, worktree: unknown): Promise<FolderResult> => {
      if (!fromChat(event)) return { ok: false, message: t('pedido inválido') }
      let chosen: string | null
      if (typeof path === 'string') {
        // Da página, só um projeto da lista; outra pasta, só escolhida no diálogo do sistema.
        if (!projects().some((project) => project.path === path)) {
          return { ok: false, message: t('Essa pasta não está nas suas pastas de projetos.') }
        }
        chosen = path
      } else {
        chosen = await pickFolder(t('Abrir uma pasta numa conversa'), homedir(), win())
        if (!chosen) return { ok: false }
      }
      let folder = usableFolder(chosen)
      if (!folder) return { ok: false, message: t('Não dá para abrir essa pasta numa conversa.') }
      // Numa cópia (Fase 43): a worktree nova, num ramo só dela; uma cópia guardada abre como está.
      if (worktree === true && copies.worktrees && !copies.worktrees.byDir(folder)) {
        try {
          folder = (await copies.worktrees.create(folder)).dir
        } catch (err) {
          return { ok: false, message: (err as Error).message }
        }
      }
      const conversation = tabs.addChat(ctx.makeConversation(undefined, undefined, folder))
      ctx.show()
      // Se a pasta tiver hooks ou ferramentas liberadas, o card de confiança já aparece.
      void conversation.checkFolder()
      return { ok: true }
    }
  )
  ipcMain.handle(IPC.promptsList, (event) => (fromChat(event) ? getConfig().prompts : []))
  ipcMain.handle(
    IPC.promptsExpand,
    async (event, id: unknown, name: unknown): Promise<string | null> => {
      if (!fromChat(event) || typeof name !== 'string') return null
      const prompt = getConfig().prompts.find((item) => item.name === name)
      if (!prompt) return null
      const conversation = typeof id === 'string' ? tabs.conversationById(id) : undefined
      // A área de transferência só é lida a seu pedido (aqui, no menu da barra), nunca numa tarefa.
      const copied = usesClipboard(prompt.text) ? await clipboard.readText() : ''
      return expandPrompt(prompt.text, promptValues(conversation?.folder ?? null, copied))
    }
  )
  return index
}

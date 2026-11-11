// As abas do painel e a grade dos painéis (Fases 11 e 16): cada aba é uma conversa (um processo do
// Claude Code) ou uma sessão do terminal; a grade mostra algumas lado a lado, e uma está em foco.
// Aqui ficam as abas, a grade e o que vai para o disco; quem cria as conversas, mostra a página e
// grava o arquivo é o chat.ts.

import type { Rectangle } from 'electron'
import { randomUUID } from 'crypto'
import { MAX_PANES } from '../shared/ipc'
import type { ConversationView, PermissionMode, TabInfo, TabsState } from '../shared/ipc'
import {
  dropTab,
  leaf,
  leaves,
  mapLeaves,
  removeLeaf,
  replaceLeaf,
  resize as resizeLayout,
  sanitize,
  splitLeaf
} from '../shared/layout'
import type { DropZone, Layout } from '../shared/layout'
import type { Conversation } from './conversation'
import { getConfig } from './config'
import { tilde } from './folders'
import { projectOf } from '../shared/projects'
import { t } from '../shared/i18n'

/** Quantas abas abertas, no máximo: cada conversa é um processo do Claude Code. */
export const MAX_TABS = 12

/** Uma aba: uma conversa do Wisp ou uma sessão do Claude Code no terminal. */
export type Tab =
  | { id: string; kind: 'chat'; conversation: Conversation }
  | { id: string; kind: 'session'; sessionId: string; title: string }

/** Uma aba de conversa, como guardada no disco. */
export interface SavedChatTab {
  kind: 'chat'
  history: string | null
  mode: PermissionMode
  folder?: string
  /** A aba estava no modo terminal (Fase 17). */
  view?: ConversationView
  /** O rascunho da caixa de texto (Fase 21). */
  draft?: string
}

/**
 * Como as abas ficam guardadas no disco. Na versão 2, a grade (com o índice de cada aba no
 * lugar do id) e a janela; a versão 1 tinha só a fileira de painéis.
 */
export interface SavedTabs {
  v: 1 | 2
  tabs: (SavedChatTab | { kind: 'session'; sessionId: string; title: string })[]
  panes?: number[]
  layout?: unknown
  focused: number
  window?: SavedWindow
}

/** A janela solta (você a moveu, redimensionou ou maximizou): onde reabrir. */
export interface SavedWindow {
  detached: boolean
  maximized: boolean
  bounds?: Rectangle
}

/** O que as abas pedem ao painel. */
export interface TabsHost {
  /** Uma conversa nova (ainda sem aba), com o modo e a pasta dados. */
  makeConversation(mode?: PermissionMode, folder?: string | null): Conversation
  /** O nome de uma sessão do terminal (o projeto); null se ela não existe. */
  sessionTitle?(sessionId: string): string | null
  /** Uma aba de conversa fechou: o processo e os arquivos dela vão embora. */
  closed(conversation: Conversation): void
  /** As abas ou a grade mudaram: a página, o disco e o tamanho da janela acompanham. */
  changed(): void
}

export class ChatTabs {
  readonly list: Tab[] = []
  /** A grade (as folhas são abas); null antes de as abas voltarem. */
  layout: Layout | null = null
  /** Os painéis à vista, na ordem da grade (sempre leaves(layout)). */
  panes: string[] = []
  focused = 0
  /** A última aba de conversa em foco: o --ask e a voz vão para ela se o foco estiver numa sessão. */
  private lastChat: string | null = null

  constructor(private readonly host: TabsHost) {}

  get full(): boolean {
    return this.list.length >= MAX_TABS
  }

  byId(id: string | undefined): Tab | undefined {
    return this.list.find((tab) => tab.id === id)
  }

  conversations(): Conversation[] {
    return this.list.flatMap((tab) => (tab.kind === 'chat' ? [tab.conversation] : []))
  }

  conversationById(id: string | undefined | null): Conversation | undefined {
    return this.conversations().find((conversation) => conversation.id === id)
  }

  /** A grade mudou: os painéis à vista acompanham, e o foco continua na mesma aba se der. */
  setLayout(next: Layout | null, focus?: string): void {
    const before = this.panes[this.focused]
    this.layout = next
    this.panes = leaves(next)
    const index = this.panes.indexOf(focus ?? before)
    this.focused = index >= 0 ? index : Math.min(this.focused, Math.max(0, this.panes.length - 1))
  }

  /** O painel em foco passa a mostrar esta aba (ou é o primeiro). */
  showInFocused(id: string): void {
    if (!this.layout || !this.panes.length) return this.setLayout(leaf(id), id)
    this.setLayout(replaceLeaf(this.layout, this.panes[this.focused], id), id)
  }

  private info(tab: Tab): TabInfo {
    if (tab.kind === 'session') {
      return { id: tab.id, kind: 'session', title: tab.title, sessionId: tab.sessionId }
    }
    const { title, project, folder } = tab.conversation
    const owner = projectOf(folder, getConfig().projects)
    return {
      id: tab.id,
      kind: 'chat',
      // Uma conversa numa pasta, ainda sem mensagens, leva o nome do projeto.
      title: title ?? project ?? t('Nova conversa'),
      ...(project ? { project } : {}),
      ...(folder ? { folder: tilde(folder) } : {}),
      ...(owner ? { inProject: { name: owner.name, color: owner.color } } : {})
    }
  }

  state(): TabsState {
    return {
      tabs: this.list.map((tab) => this.info(tab)),
      panes: [...this.panes],
      focused: this.focused,
      layout: this.layout ?? leaf(this.list[0]?.id ?? '')
    }
  }

  /** As abas mudaram: o painel acompanha. */
  changed(): void {
    const focusedTab = this.byId(this.panes[this.focused])
    if (focusedTab?.kind === 'chat') this.lastChat = focusedTab.id
    this.host.changed()
  }

  /** Põe uma conversa numa aba nova, sem mostrar. */
  push(conversation: Conversation): void {
    this.list.push({ id: conversation.id, kind: 'chat', conversation })
  }

  /** Abre uma conversa numa aba nova, à vista no painel em foco. */
  addChat(conversation = this.host.makeConversation()): Conversation {
    this.push(conversation)
    this.showInFocused(conversation.id)
    this.changed()
    return conversation
  }

  /** A conversa da aba em foco, se nada foi dito nela: dá para usar em vez de abrir outra. */
  emptyFocused(): Conversation | null {
    const conversation = this.conversationById(this.panes[this.focused])
    return conversation && !conversation.title && !conversation.busy && !conversation.historyId
      ? conversation
      : null
  }

  /** Uma conversa para algo novo: a aba em foco, se estiver vazia, ou uma aba nova. */
  fresh(): Conversation {
    return this.emptyFocused() ?? this.addChat()
  }

  /** Mostra a aba no painel em foco, ou foca o painel onde ela já está. */
  show(id: string): void {
    if (!this.byId(id)) return
    const index = this.panes.indexOf(id)
    if (index >= 0) this.focused = index
    else this.showInFocused(id)
    this.changed()
  }

  /** Foca outro painel da grade. */
  focus(index: number): void {
    if (index < 0 || index >= this.panes.length || index === this.focused) return
    this.focused = index
    this.changed()
  }

  close(id: string): void {
    const index = this.list.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const [tab] = this.list.splice(index, 1)
    if (tab.kind === 'chat') this.host.closed(tab.conversation)
    if (this.lastChat === id) this.lastChat = null
    if (!this.list.length) this.push(this.host.makeConversation())
    // O painel que mostrava a aba passa a mostrar outra que não está à vista (ou sai).
    if (this.layout && this.panes.includes(id)) {
      const hidden = this.list.find((other) => !this.panes.includes(other.id))
      if (hidden) this.setLayout(replaceLeaf(this.layout, id, hidden.id))
      else if (this.panes.length > 1) this.setLayout(removeLeaf(this.layout, id))
      else this.setLayout(leaf(this.list[0].id))
    }
    this.changed()
  }

  /**
   * Divide o painel em foco (ao lado ou embaixo), com uma aba que não está à vista (ou uma
   * conversa nova) no painel novo, que fica em foco.
   */
  split(dir: 'row' | 'column' = 'row'): void {
    if (!this.layout || this.panes.length >= MAX_PANES) return
    let hidden = this.list.find((tab) => !this.panes.includes(tab.id))
    if (!hidden) {
      if (this.full) return
      const conversation = this.host.makeConversation()
      hidden = { id: conversation.id, kind: 'chat', conversation }
      this.list.push(hidden)
    }
    this.setLayout(
      splitLeaf(
        this.layout,
        this.panes[this.focused],
        hidden.id,
        dir === 'row' ? 'right' : 'bottom'
      ),
      hidden.id
    )
    this.changed()
  }

  unsplit(pane: number): void {
    if (!this.layout || this.panes.length <= 1 || pane < 0 || pane >= this.panes.length) return
    this.setLayout(removeLeaf(this.layout, this.panes[pane]))
    this.changed()
  }

  /** Uma aba arrastada para o painel de outra: na borda divide, no meio troca. */
  drop(tab: string, target: string, zone: DropZone): void {
    if (!this.layout || !this.byId(tab) || !this.panes.includes(target) || tab === target) return
    // Uma divisão nova precisa de espaço para mais um painel.
    if (zone !== 'center' && !this.panes.includes(tab) && this.panes.length >= MAX_PANES) return
    this.setLayout(dropTab(this.layout, tab, target, zone), tab)
    this.changed()
  }

  /** As proporções de uma divisão da grade (o arraste do divisor). */
  resize(path: number[], sizes: number[]): void {
    if (!this.layout) return
    this.setLayout(resizeLayout(this.layout, path, sizes))
  }

  openSession(sessionId: string): void {
    const existing = this.list.find((tab) => tab.kind === 'session' && tab.sessionId === sessionId)
    if (existing) return this.show(existing.id)
    const title = this.host.sessionTitle?.(sessionId)
    if (!title || this.full) return
    const tab: Tab = { id: `sessao-${randomUUID()}`, kind: 'session', sessionId, title }
    this.list.push(tab)
    this.showInFocused(tab.id)
    this.changed()
  }

  /** A conversa que recebe o --ask, a voz e os arquivos soltos: a da aba em foco. */
  focusedConversation(): Conversation {
    const current = this.conversationById(this.panes[this.focused])
    if (current) return current
    // O foco está numa sessão do terminal: a última conversa vista vai para o painel em foco.
    const last = this.conversationById(this.lastChat) ?? this.conversations()[0]
    if (last) {
      this.show(last.id)
      return last
    }
    return this.addChat()
  }

  /** O que vai para o disco: as abas, a grade (pelo índice de cada aba), o foco e a janela. */
  snapshot(window: SavedWindow): SavedTabs {
    const index = (id: string): number => this.list.findIndex((tab) => tab.id === id)
    return {
      v: 2,
      tabs: this.list.map((tab) =>
        tab.kind === 'chat'
          ? {
              kind: 'chat',
              history: tab.conversation.historyId,
              mode: tab.conversation.mode,
              ...(tab.conversation.folder ? { folder: tab.conversation.folder } : {}),
              ...(tab.conversation.view === 'terminal' ? { view: 'terminal' as const } : {}),
              ...(tab.conversation.draft ? { draft: tab.conversation.draft } : {})
            }
          : { kind: 'session', sessionId: tab.sessionId, title: tab.title }
      ),
      layout: this.layout ? mapLeaves(this.layout, index) : undefined,
      focused: this.focused,
      window
    }
  }

  /**
   * As abas da última vez (`saved`, como estava no disco, ou null): as sessões voltam como
   * estavam, e cada conversa pelo `restoreChat`, que a recria a partir do que foi guardado.
   */
  restore(
    saved: Partial<SavedTabs> | null,
    restoreChat: (entry: Partial<SavedChatTab>) => Conversation
  ): void {
    const entries = Array.isArray(saved?.tabs) ? saved.tabs.slice(0, MAX_TABS) : []
    for (const entry of entries) {
      if (entry?.kind === 'session' && typeof entry.sessionId === 'string') {
        this.list.push({
          id: `sessao-${randomUUID()}`,
          kind: 'session',
          sessionId: entry.sessionId,
          title: typeof entry.title === 'string' ? entry.title.slice(0, 80) : t('Sessão')
        })
        continue
      }
      if (entry?.kind === 'chat') this.push(restoreChat(entry))
    }
    if (!this.list.length) this.push(this.host.makeConversation())
    // A grade guarda o índice de cada aba; a versão 1 guardava só a fileira de painéis.
    const byIndex = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return value
      const node = value as Record<string, unknown>
      if (node.type === 'leaf') {
        const i = Number(node.tab)
        return { type: 'leaf', tab: Number.isInteger(i) && this.list[i] ? this.list[i].id : '' }
      }
      return { ...node, children: Array.isArray(node.children) ? node.children.map(byIndex) : [] }
    }
    const valid = (id: string): boolean => !!this.byId(id)
    let restored = saved?.layout ? sanitize(byIndex(saved.layout), valid) : null
    if (!restored && Array.isArray(saved?.panes)) {
      const ids = saved.panes.flatMap((i) =>
        Number.isInteger(i) && this.list[i] ? [this.list[i].id] : []
      )
      restored = sanitize(
        { type: 'split', dir: 'row', sizes: [], children: ids.map((id) => leaf(id)) },
        valid
      )
    }
    this.setLayout(restored ?? leaf(this.list[0].id))
    this.focused = Math.min(Math.max(Number(saved?.focused) || 0, 0), this.panes.length - 1)
    const focusedTab = this.byId(this.panes[this.focused])
    this.lastChat =
      focusedTab?.kind === 'chat' ? focusedTab.id : (this.conversations()[0]?.id ?? null)
  }
}

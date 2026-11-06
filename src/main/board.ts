// O quadro de tarefas (Fase 51): cartões em A fazer, Rodando, Revisar e Feito, cada um com um
// pedido e uma pasta de projeto. Começar abre uma conversa numa cópia do Git do projeto (Fase 43)
// e manda o pedido; quando a resposta acaba, o cartão vai sozinho para Revisar, onde Juntar leva
// as mudanças para a pasta original (e o cartão vai para Feito) e Descartar tira a cópia (e o
// cartão volta para A fazer). Os cartões ficam em quadro.json, nos dados do Wisp. O quadro só
// confere as conversas (de 2 em 2 segundos) enquanto há um cartão rodando.

import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ChatTabs } from './chat-tabs'
import type { Conversation } from './conversation'
import { tilde } from './folders'
import { DATA_DIR, expandHome } from './paths'
import type { Worktrees } from './worktrees'
import { IPC } from '../shared/ipc'
import type { BoardCard, BoardColumn, BoardResult } from '../shared/ipc'
import { t } from '../shared/i18n'

export const BOARD_FILE = join(DATA_DIR, 'quadro.json')
const MAX_CARDS = 200
const MAX_PROMPT = 20_000
const TICK_MS = 2000
/** Sem ver o Claude trabalhar nesse tempo, o cartão vai para Revisar (deu erro antes de começar). */
const START_GRACE_MS = 60_000

const COLUMNS: BoardColumn[] = ['todo', 'running', 'review', 'done']

/** O que o quadro precisa do painel. */
export interface BoardHost {
  tabs: ChatTabs
  worktrees: Worktrees | null
  /** Uma conversa nova numa pasta (uma aba). */
  open(folder: string): Conversation
  show(): void
}

function validCard(value: unknown): value is BoardCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  return (
    typeof card.id === 'string' &&
    typeof card.title === 'string' &&
    typeof card.prompt === 'string' &&
    typeof card.folder === 'string' &&
    COLUMNS.includes(card.column as BoardColumn) &&
    typeof card.createdAt === 'number'
  )
}

export function readBoard(file = BOARD_FILE): BoardCard[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed.filter(validCard).slice(0, MAX_CARDS) : []
  } catch {
    return []
  }
}

export class Board {
  private cards: BoardCard[]
  /** Os cartões rodando que já viram o Claude trabalhar (o fim da resposta vale depois disso). */
  private readonly sawBusy = new Set<string>()
  private readonly startedAt = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly host: BoardHost,
    private readonly changed: (cards: BoardCard[]) => void,
    private readonly file = BOARD_FILE
  ) {
    this.cards = readBoard(file)
    // Rodando quando o Wisp fechou: a conversa não voltou rodando, então vai para Revisar.
    for (const card of this.cards) if (card.column === 'running') card.column = 'review'
    this.watch()
  }

  list(): BoardCard[] {
    return this.cards.map((card) => ({ ...card }))
  }

  add(title: string, prompt: string, folder: string): BoardResult {
    const problem = this.check(title, prompt, folder)
    if (problem) return { ok: false, message: problem }
    if (this.cards.length >= MAX_CARDS) return { ok: false, message: t('O quadro está cheio.') }
    this.cards.push({
      id: randomUUID(),
      title: title.trim(),
      prompt: prompt.trim(),
      folder: expandHome(folder),
      column: 'todo',
      createdAt: Date.now()
    })
    this.save()
    return { ok: true, message: '' }
  }

  remove(id: string): BoardResult {
    const card = this.byId(id)
    if (!card) return { ok: false, message: t('Esse cartão não existe mais.') }
    if (card.column === 'running') return { ok: false, message: t('Espere a resposta acabar.') }
    if (card.copy) {
      return { ok: false, message: t('Junte ou descarte a cópia antes de tirar o cartão.') }
    }
    this.cards = this.cards.filter((item) => item.id !== id)
    this.save()
    return { ok: true, message: '' }
  }

  move(id: string, column: BoardColumn): BoardResult {
    const card = this.byId(id)
    if (!card || !COLUMNS.includes(column) || column === 'running') {
      return { ok: false, message: t('pedido inválido') }
    }
    if (card.column === 'running') return { ok: false, message: t('Espere a resposta acabar.') }
    card.column = column
    this.save()
    return { ok: true, message: '' }
  }

  /** Começa o cartão: uma conversa numa cópia do projeto (ou na pasta, sem o Git), com o pedido. */
  async start(id: string): Promise<BoardResult> {
    const card = this.byId(id)
    if (!card || card.column === 'running') return { ok: false, message: t('pedido inválido') }
    if (this.host.tabs.full) {
      return { ok: false, message: t('As abas estão cheias: feche uma para começar o cartão.') }
    }
    let folder = card.copy ?? card.folder
    if (!card.copy && this.host.worktrees) {
      try {
        const copy = await this.host.worktrees.create(card.folder)
        card.copy = copy.dir
        folder = copy.dir
      } catch (err) {
        // Uma pasta que não é um repositório do Git roda sem cópia, e o cartão diz.
        card.note = t('Sem cópia ({message}): a conversa roda na própria pasta.', {
          message: (err as Error).message
        })
      }
    }
    const conversation = this.host.open(folder)
    card.conversation = conversation.id
    card.column = 'running'
    this.sawBusy.delete(card.id)
    this.startedAt.set(card.id, Date.now())
    conversation.showUser(card.prompt, false)
    conversation.send(card.prompt, [], () => ({ name: '', size: 0 }))
    this.host.show()
    this.save()
    this.watch()
    return { ok: true, message: '' }
  }

  /** Mostra a conversa do cartão, se a aba ainda está aberta. */
  show(id: string): boolean {
    const card = this.byId(id)
    if (!card?.conversation || !this.host.tabs.conversationById(card.conversation)) return false
    this.host.tabs.show(card.conversation)
    this.host.show()
    return true
  }

  /** Leva as mudanças da cópia para a pasta original (sem commit); o cartão vai para Feito. */
  async join(id: string): Promise<BoardResult> {
    const card = this.byId(id)
    const worktree = card?.copy ? this.host.worktrees?.byDir(card.copy) : null
    if (!card || !worktree || !this.host.worktrees) {
      return { ok: false, message: t('Esse cartão não está numa cópia.') }
    }
    try {
      const { files } = await this.host.worktrees.join(worktree)
      card.column = 'done'
      this.save()
      return {
        ok: true,
        message: files
          ? t('{files} {v2} na pasta original ({repo}), sem commit.', {
              files,
              v2: files === 1 ? t('arquivo entrou') : t('arquivos entraram'),
              repo: tilde(worktree.repo)
            })
          : t('Nada novo para juntar.')
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }

  /** Tira a cópia e o ramo (fecha a aba); o cartão volta para A fazer, para tentar de novo. */
  async discard(id: string): Promise<BoardResult> {
    const card = this.byId(id)
    const worktree = card?.copy ? this.host.worktrees?.byDir(card.copy) : null
    if (!card || !worktree || !this.host.worktrees) {
      return { ok: false, message: t('Esse cartão não está numa cópia.') }
    }
    if (card.conversation && this.host.tabs.conversationById(card.conversation)) {
      this.host.tabs.close(card.conversation)
    }
    let problem: Error | null = null
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await this.host.worktrees.discard(worktree)
        delete card.copy
        delete card.conversation
        delete card.note
        card.column = 'todo'
        this.save()
        return { ok: true, message: t('A cópia saiu.') }
      } catch (err) {
        problem = err as Error
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    return { ok: false, message: problem?.message ?? '' }
  }

  /** Confere os cartões rodando: a resposta acabou (ou a aba fechou) vai para Revisar. */
  tick(now = Date.now()): void {
    let moved = false
    for (const card of this.cards) {
      if (card.column !== 'running') continue
      const conversation = card.conversation
        ? this.host.tabs.conversationById(card.conversation)
        : undefined
      if (conversation?.busy) {
        this.sawBusy.add(card.id)
        continue
      }
      const waited = now - (this.startedAt.get(card.id) ?? 0) > START_GRACE_MS
      // Uma resposta curta pode começar e acabar entre duas conferências: o fim dela fica no
      // histórico da conversa (que é só do cartão).
      const ended =
        !!conversation && conversation.history.events().some((event) => event.type === 'turn-end')
      if (!conversation || this.sawBusy.has(card.id) || ended || waited) {
        card.column = 'review'
        this.sawBusy.delete(card.id)
        moved = true
      }
    }
    if (moved) this.save()
    if (!this.cards.some((card) => card.column === 'running')) this.unwatch()
  }

  private watch(): void {
    if (this.timer || !this.cards.some((card) => card.column === 'running')) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  private unwatch(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private byId(id: string): BoardCard | undefined {
    return this.cards.find((card) => card.id === id)
  }

  private check(title: string, prompt: string, folder: string): string | null {
    if (!title.trim() || title.length > 200) return t('Dê um título curto ao cartão.')
    if (!prompt.trim() || prompt.length > MAX_PROMPT) return t('Escreva o pedido do cartão.')
    try {
      if (!statSync(expandHome(folder)).isDirectory()) return t('Escolha uma pasta de projeto.')
    } catch {
      return t('Escolha uma pasta de projeto.')
    }
    return null
  }

  private save(): void {
    try {
      mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 })
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify(this.cards, null, 2), { mode: 0o600 })
      renameSync(temp, this.file)
    } catch (err) {
      console.warn('[wisp] não consegui gravar o quadro:', err)
    }
    this.changed(this.list())
  }
}

/** O IPC do quadro: só o painel pede. */
export function setupBoard(
  fromChat: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean,
  host: BoardHost,
  page: () => WebContents | null
): Board {
  const board = new Board(host, (cards) => page()?.send(IPC.boardChanged, cards))
  const id = (value: unknown): string | null => (typeof value === 'string' ? value : null)
  const invalid: BoardResult = { ok: false, message: t('pedido inválido') }
  ipcMain.handle(IPC.boardList, (event) => (fromChat(event) ? board.list() : []))
  ipcMain.handle(IPC.boardAdd, (event, title: unknown, prompt: unknown, folder: unknown) =>
    fromChat(event) &&
    typeof title === 'string' &&
    typeof prompt === 'string' &&
    typeof folder === 'string'
      ? board.add(title, prompt, folder)
      : invalid
  )
  ipcMain.handle(
    IPC.boardAction,
    async (event, action: unknown, card: unknown, column: unknown) => {
      const cardId = id(card)
      if (!fromChat(event) || !cardId) return invalid
      switch (action) {
        case 'start':
          return board.start(cardId)
        case 'show':
          return { ok: board.show(cardId), message: '' }
        case 'join':
          return board.join(cardId)
        case 'discard':
          return board.discard(cardId)
        case 'remove':
          return board.remove(cardId)
        case 'move':
          return board.move(cardId, column as BoardColumn)
        default:
          return invalid
      }
    }
  )
  return board
}

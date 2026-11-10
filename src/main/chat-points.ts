// Voltar, ramificar e a pergunta lateral (Fase 46), pelo painel. Cada pedido vem com o id da
// conversa, o número do turno (contado das mensagens que começam um turno, a partir de 0) e o
// texto da mensagem dele, que o main confere com o histórico antes de mexer em qualquer coisa.

import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { askAside, MAX_ASIDE } from './aside'
import type { ChatTabs } from './chat-tabs'
import { applyRewinds, forkPoint, pointBefore, turnStarts } from './history'
import { setupTurnReviews } from './turn-review'
import type { TurnReviews } from './turn-review'
import { IPC } from '../shared/ipc'
import type {
  AsideResult,
  ChatEvent,
  ReviewUndoResult,
  RewindPreview,
  RewindResult
} from '../shared/ipc'
import { t } from '../shared/i18n'

export interface PointsContext {
  fromChat(event: IpcMainEvent | IpcMainInvokeEvent): boolean
  tabs: ChatTabs
  toPage(conversation: string, event: ChatEvent): void
  /** O card do fim do turno ligado (Fase 42). */
  enabled(): boolean
}

const validTurn = (turn: unknown): turn is number =>
  typeof turn === 'number' && Number.isInteger(turn) && turn >= 0

const validFiles = (files: unknown): files is { path: string; hash: string }[] =>
  Array.isArray(files) &&
  files.length <= 500 &&
  files.every((file) => file && typeof file.path === 'string' && typeof file.hash === 'string')

const failed = (message: string): RewindResult => ({
  ok: false,
  message,
  text: '',
  attachments: [],
  undone: [],
  problems: []
})

/** Liga as revisões do fim do turno (Fase 42) e os pontos da conversa (Fase 46). */
export function registerPoints(ctx: PointsContext): TurnReviews {
  const { fromChat, tabs } = ctx
  // O número do turno que começa: as mensagens que começaram um turno, a dele inclusive.
  const reviews = setupTurnReviews(fromChat, ctx.enabled, (id) => {
    const conversation = tabs.conversationById(id)
    return conversation ? turnStarts(applyRewinds(conversation.history.events())).length : 0
  })

  /** A conversa parada do pedido, e se o turno existe nela. */
  const stopped = (
    event: IpcMainInvokeEvent,
    id: unknown,
    turn: unknown
  ):
    | { conversation: NonNullable<ReturnType<ChatTabs['conversationById']>>; turns: number }
    | string => {
    const conversation =
      fromChat(event) && typeof id === 'string' ? tabs.conversationById(id) : undefined
    if (!conversation || !validTurn(turn)) return t('pedido inválido')
    if (conversation.busy) return t('Espere a resposta acabar (ou pare-a) para voltar a conversa.')
    if (conversation.view === 'terminal')
      return t('No modo terminal, use o Esc Esc do Claude Code.')
    const turns = turnStarts(applyRewinds(conversation.history.events())).length
    if (turn >= turns) return t('Essa mensagem não está no histórico da conversa.')
    return { conversation, turns }
  }

  // A aba Mudanças da bancada (Fase 74): tudo o que a conversa mexeu, do primeiro turno até agora.
  const conversationOf = (event: IpcMainInvokeEvent, id: unknown): string | null =>
    fromChat(event) && typeof id === 'string' && tabs.conversationById(id) ? id : null
  ipcMain.handle(IPC.chatChanges, (event, id: unknown) => {
    const conversation = conversationOf(event, id)
    return conversation ? reviews.preview(conversation, 0) : { files: [], partial: false }
  })
  ipcMain.handle(IPC.chatChangesUndo, (event, id: unknown, files: unknown): ReviewUndoResult => {
    const conversation = conversationOf(event, id)
    if (!conversation || !validFiles(files)) return { undone: [], problems: [t('pedido inválido')] }
    if (tabs.conversationById(conversation)?.busy) {
      return { undone: [], problems: [t('Espere a resposta acabar para desfazer.')] }
    }
    return reviews.restore(conversation, 0, files)
  })

  ipcMain.handle(IPC.chatRewindPreview, (event, id: unknown, turn: unknown): RewindPreview => {
    const found = stopped(event, id, turn)
    if (typeof found === 'string') return { ok: false, message: found, files: [], partial: false }
    return { ok: true, ...reviews.preview(found.conversation.id, turn as number) }
  })

  ipcMain.handle(
    IPC.chatRewind,
    (event, id: unknown, turn: unknown, files: unknown): RewindResult => {
      const found = stopped(event, id, turn)
      if (typeof found === 'string') return failed(found)
      if (files !== null && !validFiles(files)) return failed(t('pedido inválido'))
      const { conversation } = found
      const keep = turn as number
      if (!pointBefore(conversation.history.events(), keep)) {
        return failed(
          t('Não deu para voltar a conversa a este ponto: ele é de antes de o Wisp guardar ') +
            t('onde voltar, ou veio do terminal. Mande a mensagem como uma nova.')
        )
      }
      // Os arquivos primeiro: as cópias dos turnos que saem vão embora com o 'rewind'.
      const restored = files?.length
        ? reviews.restore(conversation.id, keep, files)
        : { undone: [], problems: [] }
      const point = conversation.rewindTo(keep)
      if (!point)
        return { ...failed(t('Não deu para voltar a conversa a este ponto.')), ...restored }
      const rewind: ChatEvent = { type: 'rewind', keep }
      reviews.onEvent(conversation.id, rewind)
      ctx.toPage(conversation.id, rewind)
      return { ok: true, text: point.text, attachments: point.attachments, ...restored }
    }
  )

  ipcMain.handle(IPC.chatFork, (event, id: unknown, turn: unknown): boolean => {
    const found = stopped(event, id, turn)
    if (typeof found === 'string') return false
    const source = found.conversation
    const historyId = source.historyId
    const saved = historyId ? source.history.load(historyId) : null
    const point = saved ? forkPoint(saved.events, turn as number) : undefined
    if (!saved || !point) {
      source.notice(
        'warning',
        t('Não deu para ramificar daqui: a resposta dessa mensagem é de antes de o Wisp guardar ') +
          t('onde voltar, ou veio do terminal.')
      )
      return false
    }
    if (tabs.full) {
      source.notice('warning', t('As abas estão cheias: feche uma para ramificar a conversa.'))
      return false
    }
    const fork = tabs.addChat()
    const events = fork.forkOf({
      sessionId: saved.sessionId,
      at: point.at,
      folder: source.folder,
      provider: source.provider,
      title: source.title ?? saved.title,
      events: point.events
    })
    for (const replayed of events) ctx.toPage(fork.id, replayed)
    tabs.show(fork.id)
    return true
  })

  ipcMain.handle(
    IPC.chatAside,
    async (event, id: unknown, question: unknown): Promise<AsideResult> => {
      const conversation =
        fromChat(event) && typeof id === 'string' ? tabs.conversationById(id) : undefined
      if (!conversation || typeof question !== 'string') {
        return { ok: false, text: t('pedido inválido') }
      }
      const launch = conversation.session.asideLaunch()
      if (!launch) {
        return {
          ok: false,
          text: t(
            'A pergunta lateral precisa do Claude Code (e, pela OpenRouter, da chave e do modelo).'
          )
        }
      }
      return askAside(launch, question.slice(0, MAX_ASIDE))
    }
  )
  return reviews
}

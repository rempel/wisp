import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { IPC } from '../shared/ipc'
import type { HooksAction, SessionAnswer, SessionsSnapshot } from '../shared/ipc'
import { applyHooks, hooksStatus, previewHooks } from './hooks/install'
import type { ExternalSessions } from './sessions'
import { focusTerminal } from './terminal'
import type { FocusResult } from './terminal'

export interface SessionsIpcOptions {
  sessions: ExternalSessions
  /** O IPC veio da página do painel? */
  isChat(sender: WebContents): boolean
  /** Se o Wisp está ouvindo os hooks (o socket subiu), ou por que não. */
  listening(): { ok: boolean; problem?: string }
  /** Os hooks mudaram (instalados ou tirados): a aba busca de novo. */
  changed(): void
  openFolder(cwd: string): void
  continueInChat(sessionId: string): void
}

const isAction = (value: unknown): value is HooksAction =>
  value === 'install' || value === 'uninstall'

/** Confere a resposta que veio da página antes de ela chegar ao rastreador. */
function parseAnswer(value: unknown): SessionAnswer | null {
  if (!value || typeof value !== 'object') return null
  const answer = value as Record<string, unknown>
  if ('answers' in answer) {
    const answers = answer.answers
    if (answers === null) return { answers: null }
    return answers && typeof answers === 'object' && !Array.isArray(answers)
      ? { answers: answers as Record<string, string> }
      : null
  }
  const decision = answer.decision
  return decision === 'allow' ||
    decision === 'allow-always' ||
    decision === 'deny' ||
    decision === 'terminal'
    ? { decision }
    : null
}

/** IPC da aba Sessões: a lista, as respostas aos pedidos, os atalhos e os hooks. */
export function setupSessionsIpc(options: SessionsIpcOptions): void {
  const { sessions, isChat } = options
  const id = (value: unknown): string | null =>
    typeof value === 'string' && value.length < 200 ? value : null

  ipcMain.handle(IPC.sessionsGet, (event): SessionsSnapshot | null => {
    if (!isChat(event.sender)) return null
    const listening = options.listening()
    return {
      hooks: hooksStatus(),
      listening: listening.ok,
      problem: listening.problem,
      sessions: sessions.list()
    }
  })
  ipcMain.on(
    IPC.sessionsAnswer,
    (event, sessionId: unknown, requestId: unknown, value: unknown) => {
      const answer = parseAnswer(value)
      if (!isChat(event.sender) || !id(sessionId) || !id(requestId) || !answer) return
      sessions.answer(sessionId as string, requestId as string, answer)
    }
  )
  ipcMain.handle(IPC.sessionsFocus, async (event, sessionId: unknown): Promise<FocusResult> => {
    const where =
      isChat(event.sender) && id(sessionId) ? sessions.locate(sessionId as string) : null
    if (!where) return { ok: false, message: 'Não achei esta sessão.' }
    if (!where.alive) return { ok: false, message: 'Esta sessão já foi encerrada.' }
    return focusTerminal(where)
  })
  ipcMain.on(IPC.sessionsFolder, (event, sessionId: unknown) => {
    const where =
      isChat(event.sender) && id(sessionId) ? sessions.locate(sessionId as string) : null
    if (where?.cwd) options.openFolder(where.cwd)
  })
  ipcMain.on(IPC.sessionsContinue, (event, sessionId: unknown) => {
    if (isChat(event.sender) && id(sessionId)) options.continueInChat(sessionId as string)
  })
  ipcMain.on(IPC.sessionsForget, (event, sessionId: unknown) => {
    if (isChat(event.sender) && id(sessionId)) sessions.forget(sessionId as string)
  })
  ipcMain.handle(IPC.hooksPreview, (event, action: unknown) => {
    if (!isChat(event.sender) || !isAction(action)) return { error: 'pedido inválido' }
    return previewHooks(action)
  })
  ipcMain.handle(IPC.hooksApply, (event, action: unknown, fingerprint: unknown) => {
    if (!isChat(event.sender) || !isAction(action) || typeof fingerprint !== 'string') {
      return { error: 'pedido inválido' }
    }
    const result = applyHooks(action, fingerprint)
    options.changed()
    return result
  })
}

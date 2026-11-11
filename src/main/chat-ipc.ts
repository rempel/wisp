// O que a página do painel pede de uma conversa (saiu do chat.ts, que estava no limite de
// linhas): mandar e parar, editar a última, o rascunho, recomeçar, o modelo, o provedor, o modo,
// compactar, o modo terminal e a imagem colada. Cada pedido confere quem mandou e os tipos.

import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { savePasted } from './attachments'
import { bytesOf, outgoing, previewOf } from './chat-conversation'
import { MODEL_NAME, updateConfig } from './config'
import type { Conversation } from './conversation'
import { IPC, MODEL_CHOICES, PERMISSION_MODES } from '../shared/ipc'
import type { PastedImage, PermissionMode } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface ConversationIpcContext {
  /** O pedido veio da página do painel? */
  fromChat(event: IpcMainEvent | IpcMainInvokeEvent): boolean
  /** A conversa de um pedido da página, se ele veio dela e a conversa existe. */
  target(event: IpcMainEvent | IpcMainInvokeEvent, id: unknown): Conversation | undefined
  /** O usuário mexeu no painel (o mascote não cochila). */
  onActivity?: () => void
  /** Algo que fica guardado mudou (o rascunho): as abas são gravadas logo. */
  scheduleSave(): void
}

const isMode = (value: unknown): value is PermissionMode =>
  PERMISSION_MODES.includes(value as PermissionMode)

export function registerConversationIpc(ctx: ConversationIpcContext): void {
  const { fromChat, target, onActivity, scheduleSave } = ctx
  ipcMain.on(IPC.chatActivity, (event) => {
    if (fromChat(event)) onActivity?.()
  })
  ipcMain.on(IPC.chatSend, (event, id: unknown, text: unknown, attachments: unknown) => {
    const conversation = target(event, id)
    if (!conversation || typeof text !== 'string') return
    conversation.send(text, outgoing(attachments), previewOf)
  })
  ipcMain.on(IPC.chatStop, (event, id: unknown) => target(event, id)?.stop())
  ipcMain.handle(
    IPC.chatEditLast,
    (event, id: unknown, text: unknown, attachments: unknown): boolean => {
      const conversation = target(event, id)
      if (!conversation || typeof text !== 'string') return false
      return conversation.editLast(text, outgoing(attachments), previewOf)
    }
  )
  ipcMain.on(IPC.chatDraft, (event, id: unknown, text: unknown) => {
    const conversation = target(event, id)
    if (!conversation || typeof text !== 'string' || text === conversation.draft) return
    conversation.setDraft(text)
    scheduleSave()
  })
  ipcMain.on(IPC.chatNew, (event, id: unknown) => target(event, id)?.reset())
  ipcMain.on(IPC.chatModel, (event, id: unknown, choice: unknown) => {
    const conversation = target(event, id)
    if (!conversation) return
    if (conversation.provider === 'openrouter') {
      // Qualquer modelo da OpenRouter, desde que o nome tenha cara de nome de modelo.
      if (typeof choice !== 'string' || !MODEL_NAME.test(choice)) return
      updateConfig({ openrouterModel: choice })
      conversation.setModel(choice)
      return
    }
    if (choice !== null && !MODEL_CHOICES.includes(choice as (typeof MODEL_CHOICES)[number])) return
    const model = choice as string | null
    updateConfig({ model })
    conversation.setModel(model)
  })
  ipcMain.on(IPC.chatView, (event, id: unknown, view: unknown) => {
    if (view !== 'chat' && view !== 'terminal') return
    void target(event, id)?.setView(view)
  })
  ipcMain.handle(IPC.tuiAttach, (event, id: unknown) => target(event, id)?.attachTerminal() ?? '')
  ipcMain.on(IPC.tuiInput, (event, id: unknown, data: unknown) => {
    if (typeof data !== 'string' || data.length > 1_000_000) return
    target(event, id)?.terminalInput(data)
  })
  ipcMain.on(IPC.tuiResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof cols !== 'number' || typeof rows !== 'number') return
    target(event, id)?.resizeTerminal(Math.floor(cols), Math.floor(rows))
  })
  ipcMain.on(IPC.chatCompact, (event, id: unknown, instructions: unknown) => {
    target(event, id)?.compact(typeof instructions === 'string' ? instructions : '')
  })
  ipcMain.on(IPC.chatProvider, (event, id: unknown, provider: unknown) => {
    if (provider !== 'subscription' && provider !== 'openrouter') return
    target(event, id)?.setProvider(provider)
  })
  ipcMain.on(IPC.chatMode, (event, id: unknown, mode: unknown) => {
    if (isMode(mode)) target(event, id)?.setMode(mode)
  })
  ipcMain.handle(
    IPC.chatPaste,
    async (event, data: unknown, type: unknown): Promise<PastedImage> => {
      const bytes = bytesOf(data)
      if (!fromChat(event) || !bytes || typeof type !== 'string')
        return { error: t('pedido inválido') }
      try {
        return await savePasted(bytes, type)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )
}

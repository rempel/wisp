// A OpenRouter nas configurações (Fase 14): a lista de modelos e a chave, que fica no chaveiro do
// sistema. Aqui só se sabe se ela existe (sem destrancar), e o chaveiro só é consultado quando a
// tela de configurações abre: quem não usa a OpenRouter não tem por que acordá-lo.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { checkKey, listModels, looksLikeKey, OPENROUTER_SECRET } from './openrouter'
import { deleteSecret, hasSecret, storeSecret } from './secrets'
import { IPC } from '../shared/ipc'
import type { OpenRouterKeyResult } from '../shared/ipc'

export interface OpenRouterIpcOptions {
  isSender(sender: WebContents): boolean
  /** A chave mudou: as conversas e a tela de configurações acompanham. */
  keyChanged(): void
  /** A tela de configurações relê o que mostra. */
  refresh(): void
}

/** Registra os pedidos do painel. Devolve se a chave existe (null: ainda não se sabe). */
export function setupOpenRouterIpc(options: OpenRouterIpcOptions): { hasKey(): boolean | null } {
  const { isSender } = options
  let key: boolean | null = null
  let asked = false
  const refreshKey = async (): Promise<void> => {
    try {
      key = await hasSecret(OPENROUTER_SECRET)
    } catch {
      key = null
    }
    options.refresh()
  }
  ipcMain.handle(IPC.openrouterModels, async (event) => {
    if (!isSender(event.sender)) return { error: 'pedido inválido' }
    try {
      return (await listModels()).map(({ id, name, prompt, completion, context }) => ({
        id,
        name,
        prompt,
        completion,
        context
      }))
    } catch (err) {
      return { error: `Não consegui buscar os modelos da OpenRouter (${(err as Error).message}).` }
    }
  })
  ipcMain.handle(
    IPC.openrouterSetKey,
    async (event, value: unknown): Promise<OpenRouterKeyResult> => {
      if (!isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
      const typed = typeof value === 'string' ? value.trim() : ''
      if (!looksLikeKey(typed)) {
        return {
          ok: false,
          message: 'Isso não parece uma chave da OpenRouter (elas começam com sk-or-).'
        }
      }
      const checked = await checkKey(typed)
      // Sem rede, a chave é guardada mesmo assim; recusada pela OpenRouter, não.
      const offline = !checked.ok && checked.message.startsWith('Não consegui falar')
      if (!checked.ok && !offline) return checked
      try {
        await storeSecret(OPENROUTER_SECRET, 'Wisp: chave da OpenRouter', typed)
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
      key = true
      options.keyChanged()
      options.refresh()
      return checked.ok
        ? { ok: true, label: checked.label }
        : { ok: true, label: null, note: 'Guardada, mas não deu para conferir agora (sem rede).' }
    }
  )
  ipcMain.handle(IPC.openrouterClearKey, async (event): Promise<OpenRouterKeyResult> => {
    if (!isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    try {
      await deleteSecret(OPENROUTER_SECRET)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    key = false
    options.keyChanged()
    options.refresh()
    return { ok: true, label: null }
  })
  return {
    hasKey: () => {
      if (!asked) {
        asked = true
        void refreshKey()
      }
      return key
    }
  }
}

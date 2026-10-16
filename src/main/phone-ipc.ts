// A aprovação pelo celular (Fase 18) no app: o pareamento pela tela de configurações, o canal
// lido do chaveiro e os cards das conversas indo para o celular (phone.ts).
//
// O canal só é lido do chaveiro quando a função está ligada (na abertura do Wisp) ou no
// pareamento, e fica na memória: com a tela bloqueada, o chaveiro poderia pedir a senha.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { getConfig, notifyConfigChange, onConfigChange, updateConfig } from './config'
import {
  confirmPairing,
  newChannel,
  normalizeServer,
  parseChannel,
  PHONE_EXPIRY_MS,
  PHONE_SECRET,
  PhoneApprovals,
  subscribeLink,
  webLink
} from './phone'
import type { PhoneChannel, PhoneDecision } from './phone'
import { deleteSecret, hasSecret, readSecret, storeSecret } from './secrets'
import { IPC } from '../shared/ipc'
import type { ChatEvent, PhonePairResult, PhoneResult, PhoneStatus } from '../shared/ipc'

export interface PhoneOptions {
  /** O pedido veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** O estado mudou: a tela de configurações acompanha. */
  notify(): void
  /** Responde um card de uma conversa (devolve false se ele já não esperava). */
  answer(id: string, decision: PhoneDecision, how: 'phone' | 'expired'): boolean
  /** Quanto um pedido no celular espera (ms); os testes encurtam. */
  expiryMs?: number
}

export interface Phone {
  approvals: PhoneApprovals
  status(): PhoneStatus
  /** Cada evento das conversas: os cards que aparecem e os respondidos. */
  onChatEvent(event: ChatEvent): void
  dispose(): void
}

const NO_REPLY =
  'O celular não respondeu a tempo. Confira se o app do ntfy assinou o tópico (pelo QR code) e ' +
  'tente de novo.'

export function setupPhone(options: PhoneOptions): Phone {
  let channel: PhoneChannel | null = null
  let paired: boolean | null = null
  let pairedAsked = false
  let pairing: AbortController | null = null
  const expiryMs = options.expiryMs ?? PHONE_EXPIRY_MS

  const approvals = new PhoneApprovals({
    enabled: () => getConfig().phoneApprovals && channel !== null,
    afterMs: () => getConfig().phoneAfterSeconds * 1000,
    channel: () => channel,
    answer: options.answer,
    expiryMs,
    log: (message) => console.warn(`[wisp] celular: ${message}`)
  })

  const load = async (): Promise<PhoneChannel | null> => {
    try {
      channel = parseChannel(await readSecret(PHONE_SECRET))
      paired = channel !== null
    } catch (err) {
      console.warn(
        `[wisp] celular: não consegui ler o pareamento do chaveiro (${(err as Error).message})`
      )
      paired = null
    }
    return channel
  }

  const disable = (): void => {
    approvals.reset()
    if (getConfig().phoneApprovals) {
      updateConfig({ phoneApprovals: false })
      notifyConfigChange()
    } else {
      options.notify()
    }
  }

  if (getConfig().phoneApprovals) void load().then(() => options.notify())
  // Editado à mão no config.json: desligado, nada mais vai; ligado, o canal é lido.
  onConfigChange((config) => {
    if (!config.phoneApprovals) approvals.reset()
    else if (!channel) void load()
  })

  const linkOf = (current: PhoneChannel): PhonePairResult => ({
    ok: true,
    link: subscribeLink(current),
    web: webLink(current),
    server: current.server
  })

  ipcMain.handle(IPC.phonePair, async (event, server: unknown, token: unknown) => {
    if (!options.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    const url = typeof server === 'string' ? normalizeServer(server) : null
    if (!url)
      return {
        ok: false,
        message: 'O servidor precisa ser um endereço http(s), como https://ntfy.sh.'
      }
    const ticket = typeof token === 'string' ? token.trim() : ''
    if (ticket && !/^[\x21-\x7e]{1,200}$/.test(ticket)) {
      return { ok: false, message: 'A ficha de acesso tem caracteres que não são de uma ficha.' }
    }
    const next = newChannel(url, ticket || null)
    try {
      await storeSecret(PHONE_SECRET, 'Wisp: celular (ntfy)', JSON.stringify(next))
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    pairing?.abort()
    approvals.reset()
    channel = next
    paired = true
    pairedAsked = true
    updateConfig({ phoneServer: url, phoneApprovals: false })
    notifyConfigChange()
    return linkOf(next)
  })

  ipcMain.handle(IPC.phoneLink, async (event): Promise<PhonePairResult> => {
    if (!options.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    const current = channel ?? (await load())
    return current ? linkOf(current) : { ok: false, message: 'Nenhum celular pareado.' }
  })

  ipcMain.handle(IPC.phoneConfirm, async (event): Promise<PhoneResult> => {
    if (!options.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    const current = channel ?? (await load())
    if (!current) return { ok: false, message: 'Pareie o celular antes.' }
    pairing?.abort()
    const abort = new AbortController()
    pairing = abort
    try {
      const confirmed = await confirmPairing(current, expiryMs, abort.signal)
      if (abort.signal.aborted && !confirmed) return { ok: false, message: 'Teste cancelado.' }
      if (!confirmed) return { ok: false, message: NO_REPLY }
      if (channel !== current) return { ok: false, message: 'O pareamento mudou no meio do teste.' }
      updateConfig({ phoneApprovals: true })
      notifyConfigChange()
      return {
        ok: true,
        message: 'O celular respondeu. Os pedidos vão para ele quando você não estiver aqui.'
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    } finally {
      if (pairing === abort) pairing = null
    }
  })

  ipcMain.on(IPC.phoneCancel, (event) => {
    if (options.isSender(event.sender)) pairing?.abort()
  })

  ipcMain.handle(IPC.phoneDisable, (event): PhoneResult => {
    if (!options.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    disable()
    return { ok: true }
  })

  ipcMain.handle(IPC.phoneUnpair, async (event): Promise<PhoneResult> => {
    if (!options.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    pairing?.abort()
    try {
      await deleteSecret(PHONE_SECRET)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    channel = null
    paired = false
    disable()
    return { ok: true, message: 'Pareamento desfeito.' }
  })

  return {
    approvals,
    status() {
      // Só pergunta ao chaveiro (sem destrancar) quando a tela de configurações abre.
      if (paired === null && !pairedAsked) {
        pairedAsked = true
        void hasSecret(PHONE_SECRET)
          .then((present) => (paired = present))
          .catch(() => (paired = null))
          .then(() => options.notify())
      }
      const config = getConfig()
      return { enabled: config.phoneApprovals, paired, server: config.phoneServer }
    },
    onChatEvent(event) {
      if (event.type === 'permission-request')
        approvals.request(event.id, event.toolName, event.input)
      else if (event.type === 'permission-resolved') approvals.resolved(event.id)
    },
    dispose() {
      pairing?.abort()
      approvals.reset()
    }
  }
}

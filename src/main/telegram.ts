// O Wisp no Telegram (Fase 85): um bot seu (criado no @BotFather), lido por long polling, só com
// conexões de saída e nenhuma porta aberta. Só o seu usuário é atendido: o primeiro que mandar o
// código de pareamento mostrado no painel. As mensagens caem na Wisp (a conversa principal) e as
// respostas voltam pelo bot; os cards chegam com Permitir uma vez e Negar, com as regras do ntfy
// (Fase 18): nunca "sempre", e um comando com arquivos de segredos só pode ser negado.
//
// O que chegou com o Wisp fechado (o Telegram guarda por um dia): o das últimas 12 horas é
// respondido, avisando que ele estava desligado; o mais velho vira um resumo só.

import { randomBytes, randomInt } from 'crypto'
import { summarize } from './phone'
import type { PhoneDecision } from './phone'
import { t } from '../shared/i18n'

export const DEFAULT_TELEGRAM_API = 'https://api.telegram.org'
/** O que chegou há mais que isso, com o Wisp fechado, só entra no resumo. */
export const STALE_MS = 12 * 60 * 60_000
/** Quanto o long polling espera por mensagens (s). */
const POLL_SECONDS = 50
/** O pareamento vale por isso. */
const PAIR_MS = 10 * 60_000
/** Depois de uma falha da rede, quanto esperar para tentar de novo (ms). */
const RETRY_MS = 5000
/** O Telegram corta mensagens com mais que isso. */
const MAX_TEXT = 4000
/** Conversou pelo Telegram há menos que isso: os cards vão para lá na hora. */
export const RECENT_MS = 30 * 60_000

// ---- A API do Telegram --------------------------------------------------------------------------

export interface TgUser {
  id: number
  first_name?: string
  username?: string
}

export interface TgMessage {
  message_id: number
  date: number
  from?: TgUser
  chat: { id: number }
  text?: string
  caption?: string
  voice?: { file_id: string; duration?: number }
  audio?: { file_id: string; file_name?: string }
  photo?: { file_id: string; width: number; height: number }[]
  document?: { file_id: string; file_name?: string; file_size?: number }
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: {
    id: string
    from: TgUser
    data?: string
    message?: { message_id: number; chat: { id: number } }
  }
}

type Fetch = typeof fetch
type Button = { text: string; callback_data: string }

/** A Bot API, pelo fetch. Os erros dizem o método, nunca a ficha. */
export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly base = DEFAULT_TELEGRAM_API,
    private readonly fetcher: Fetch = fetch
  ) {}

  private async call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.fetcher(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      result?: T
      description?: string
    } | null
    if (!res.ok || !data?.ok) {
      throw new Error(`${method}: ${data?.description ?? `HTTP ${res.status}`}`)
    }
    return data.result as T
  }

  getMe(): Promise<TgUser> {
    return this.call('getMe', {})
  }

  getUpdates(offset: number, timeout: number, signal?: AbortSignal): Promise<TgUpdate[]> {
    return this.call(
      'getUpdates',
      { offset, timeout, allowed_updates: ['message', 'callback_query'] },
      signal
    )
  }

  sendMessage(chat: number, text: string, buttons?: Button[][]): Promise<{ message_id: number }> {
    return this.call('sendMessage', {
      chat_id: chat,
      text: text.slice(0, MAX_TEXT),
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
    })
  }

  editMessage(chat: number, message: number, text: string): Promise<unknown> {
    return this.call('editMessageText', {
      chat_id: chat,
      message_id: message,
      text: text.slice(0, MAX_TEXT)
    })
  }

  answerCallback(id: string, text: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: id, text })
  }

  /** Baixa um arquivo mandado ao bot (até 20 MB, o limite da Bot API). */
  async download(fileId: string): Promise<Buffer> {
    const file = await this.call<{ file_path?: string }>('getFile', { file_id: fileId })
    if (!file.file_path) throw new Error('getFile: sem caminho')
    const res = await this.fetcher(`${this.base}/file/bot${this.token}/${file.file_path}`)
    if (!res.ok) throw new Error(`download: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  async sendVoice(chat: number, ogg: Buffer): Promise<unknown> {
    const form = new FormData()
    form.append('chat_id', String(chat))
    form.append('voice', new Blob([new Uint8Array(ogg)], { type: 'audio/ogg' }), 'wisp.ogg')
    const res = await this.fetcher(`${this.base}/bot${this.token}/sendVoice`, {
      method: 'POST',
      body: form
    })
    if (!res.ok) throw new Error(`sendVoice: HTTP ${res.status}`)
    return res.json()
  }
}

/** Corta um texto longo em mensagens do tamanho que o Telegram aceita, nas quebras de linha. */
export function splitMessage(text: string, max = MAX_TEXT): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max)
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max)
    if (cut < max / 2) cut = max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

// ---- O bot ---------------------------------------------------------------------------------------

/** Os comandos rápidos: viram pedidos à Wisp (o /novo e o /ajuda o Wisp resolve sozinho). */
export function commandPrompt(text: string): string | null {
  const match = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text.trim())
  if (!match) return null
  const [, name, rest] = match
  switch (name.toLowerCase()) {
    case 'agenda':
      return t('Quais são os meus compromissos de hoje e de amanhã?')
    case 'tarefas':
      return t('Quais tarefas eu tenho agendadas?')
    case 'memoria':
      return t('O que você sabe sobre mim? Resuma a memória.')
    case 'lembrar':
      return rest.trim() ? t('Me lembra: {what}', { what: rest.trim() }) : null
    default:
      return null
  }
}

/** A ajuda do /start e do /ajuda. */
export const helpText = (): string =>
  t('Sou o Wisp. O que você mandar aqui vai para a conversa principal no seu computador.') +
  '\n\n' +
  [
    t('/agenda — os compromissos de hoje e amanhã'),
    t('/tarefas — as tarefas agendadas'),
    t('/memoria — o que eu sei de você'),
    t('/lembrar <o quê e quando> — marca um lembrete'),
    t('/novo — começa uma conversa nova')
  ].join('\n') +
  '\n\n' +
  t(
    'Dá para mandar áudios, fotos e arquivos. Os pedidos de permissão chegam com Permitir uma vez e Negar.'
  )

export interface Attachment {
  path: string
}

export interface TelegramDeps {
  api(): TelegramApi | null
  /** Ligado, com o usuário pareado (null: ainda sem). */
  enabled(): boolean
  user(): number | null
  /** Pareou: guarda o usuário (no config). */
  paired(user: TgUser): void
  /** Como responder: texto, áudio ou os dois. */
  voiceReply(): 'text' | 'audio' | 'both'
  /** Manda à Wisp e espera a resposta (o texto); null: ela estava ocupada. */
  ask(text: string, files: Attachment[], voice: boolean): Promise<string | null>
  /** O /novo: a Wisp começa uma conversa nova. */
  reset(): void
  /** Um áudio (Ogg/Opus) em texto; lança o motivo, se não der. */
  transcribe(ogg: Buffer): Promise<string>
  /** Um texto em áudio (Ogg/Opus); null se não der (sem o Piper ou o ffmpeg). */
  speak(text: string): Promise<Buffer | null>
  /** Guarda um arquivo recebido, para ir como anexo. */
  save(name: string, bytes: Buffer): string
  /** Responde um card (false se ele já não esperava). */
  answer(id: string, decision: PhoneDecision): boolean
  /** A tela está bloqueada (os cards vão para o Telegram). */
  locked(): boolean
  /** Quanto um card espera antes de ir (ms). */
  afterMs(): number
  /** O offset das atualizações já lidas (guardado entre aberturas). */
  offset(): number
  setOffset(offset: number): void
  now?(): number
  log?(message: string): void
}

interface Card {
  id: string
  allow: string | null
  deny: string
  chat?: number
  message?: number
  timer: NodeJS.Timeout | null
}

const ticket = (): string => randomBytes(9).toString('base64url')

export class TelegramBot {
  private running = false
  private stop: AbortController | null = null
  private queue: TgMessage[] = []
  private working = false
  private pairCode: { code: string; until: number } | null = null
  private lastTalk = 0
  /** A primeira volta depois de abrir (o que chegou com o Wisp fechado). */
  private firstBatch = true
  private readonly startedAt: number
  private readonly cards = new Map<string, Card>()

  constructor(private readonly deps: TelegramDeps) {
    this.startedAt = this.now()
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Um código novo de pareamento (6 números, vale 10 minutos). */
  newPairCode(): string {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    this.pairCode = { code, until: this.now() + PAIR_MS }
    return code
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.loop()
  }

  dispose(): void {
    this.running = false
    this.stop?.abort()
    for (const card of this.cards.values()) if (card.timer) clearTimeout(card.timer)
    this.cards.clear()
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const api = this.deps.api()
      if (!api || (!this.deps.enabled() && !this.pairCode)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        continue
      }
      this.stop = new AbortController()
      try {
        const updates = await api.getUpdates(this.deps.offset(), POLL_SECONDS, this.stop.signal)
        // Sem esperar as mensagens: o botão de um card precisa chegar enquanto a Wisp responde.
        await this.handle(updates, false)
      } catch (err) {
        if (!this.running) return
        this.deps.log?.((err as Error).message)
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
      }
    }
  }

  /**
   * Uma leva de atualizações: os botões na hora, as mensagens na fila (uma por vez). `wait`:
   * espera a fila acabar (os testes); o laço não espera, para os botões não ficarem presos.
   */
  async handle(updates: TgUpdate[], wait = true): Promise<void> {
    const stale: TgMessage[] = []
    for (const update of updates) {
      this.deps.setOffset(update.update_id + 1)
      if (update.callback_query) {
        await this.callback(update.callback_query)
        continue
      }
      const message = update.message
      if (!message?.from) continue
      if (await this.pairing(message)) continue
      if (!this.deps.enabled() || message.from.id !== this.deps.user()) continue
      if (this.now() - message.date * 1000 > STALE_MS) stale.push(message)
      else this.queue.push(message)
    }
    const first = this.firstBatch
    this.firstBatch = false
    if (stale.length) await this.summarizeStale(stale)
    if (first && this.queue.some((message) => message.date * 1000 < this.startedAt - 60_000)) {
      await this.reply(this.queue[0].chat.id, t('Eu estava desligado; respondendo agora.'))
    }
    const working = this.work()
    if (wait) await working
  }

  /** O pareamento: o código certo, de qualquer usuário, enquanto vale. */
  private async pairing(message: TgMessage): Promise<boolean> {
    const code = this.pairCode
    if (!code || this.now() > code.until || !message.from) return false
    const sent = (message.text ?? '').trim().replace(/^\/start\s+/, '')
    if (sent !== code.code) return false
    this.pairCode = null
    this.deps.paired(message.from)
    await this.reply(message.chat.id, `${t('Pareado com o Wisp.')} ${helpText()}`)
    return true
  }

  private async summarizeStale(messages: TgMessage[]): Promise<void> {
    const lines = messages
      .map((message) => (message.text ?? message.caption ?? t('(um anexo)')).replace(/\s+/g, ' '))
      .map((text) => `• ${text.length > 120 ? `${text.slice(0, 119)}…` : text}`)
    await this.reply(
      messages[0].chat.id,
      `${t('Eu estava desligado, e estas mensagens chegaram há mais de 12 horas:')}\n${lines.join('\n')}\n\n${t('Ainda valem? Mande de novo o que for.')}`
    )
  }

  private async work(): Promise<void> {
    if (this.working) return
    this.working = true
    try {
      while (this.queue.length) {
        const message = this.queue.shift() as TgMessage
        try {
          await this.message(message)
        } catch (err) {
          this.deps.log?.((err as Error).message)
          await this.reply(
            message.chat.id,
            t('Não deu: {error}', { error: (err as Error).message })
          ).catch(() => {})
        }
      }
    } finally {
      this.working = false
    }
  }

  /** Uma mensagem sua: um comando, um áudio, anexos ou texto, para a Wisp. */
  private async message(message: TgMessage): Promise<void> {
    const chat = message.chat.id
    const api = this.deps.api()
    if (!api) return
    this.lastTalk = this.now()
    let text = (message.text ?? message.caption ?? '').trim()
    if (/^\/(start|ajuda|help)\b/.test(text)) {
      await this.reply(chat, helpText())
      return
    }
    if (/^\/novo\b/.test(text)) {
      this.deps.reset()
      await this.reply(chat, t('Conversa nova na Wisp.'))
      return
    }
    const command = text.startsWith('/') ? commandPrompt(text) : null
    if (text.startsWith('/') && !command) {
      await this.reply(chat, `${t('Não conheço esse comando.')}\n\n${helpText()}`)
      return
    }
    if (command) text = command
    let voice = false
    const voiceFile = message.voice ?? message.audio
    if (voiceFile) {
      try {
        text = await this.deps.transcribe(await api.download(voiceFile.file_id))
        voice = true
      } catch (err) {
        await this.reply(
          chat,
          t('Não consegui ouvir o áudio: {error}', { error: (err as Error).message })
        )
        return
      }
      if (!text.trim()) {
        await this.reply(chat, t('Não entendi nada no áudio.'))
        return
      }
    }
    const files: Attachment[] = []
    const photo = message.photo?.length
      ? message.photo.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
      : null
    if (photo) {
      files.push({
        path: this.deps.save(
          `telegram-${message.message_id}.jpg`,
          await api.download(photo.file_id)
        )
      })
    }
    if (message.document) {
      const name = (message.document.file_name ?? `arquivo-${message.message_id}`)
        .replace(/[^\w.\- ]+/g, '_')
        .slice(0, 80)
      files.push({ path: this.deps.save(name, await api.download(message.document.file_id)) })
    }
    if (!text && !files.length) return
    const answer = await this.deps.ask(text, files, voice)
    if (answer === null) {
      await this.reply(
        chat,
        t('Ainda estou respondendo a mensagem anterior. Mande de novo daqui a pouco.')
      )
      return
    }
    await this.send(chat, answer || t('(sem resposta em texto)'), voice)
  }

  /** Manda a resposta: em texto, em áudio ou nos dois (o áudio quando a pergunta foi áudio). */
  private async send(chat: number, text: string, askedByVoice: boolean): Promise<void> {
    const api = this.deps.api()
    if (!api) return
    const mode = this.deps.voiceReply()
    const audio = mode === 'both' || (mode === 'audio' && askedByVoice)
    let spoke = false
    if (audio) {
      const ogg = await this.deps.speak(text).catch(() => null)
      if (ogg) {
        await api.sendVoice(chat, ogg)
        spoke = true
      }
    }
    if (!spoke || mode === 'both') {
      for (const part of splitMessage(text)) await api.sendMessage(chat, part)
    }
  }

  private async reply(chat: number, text: string): Promise<void> {
    await this.deps.api()?.sendMessage(chat, text)
  }

  /** Manda um aviso ao seu usuário (a entrega das tarefas e do batimento). */
  async notify(title: string, text: string): Promise<boolean> {
    const user = this.deps.user()
    const api = this.deps.api()
    if (!this.deps.enabled() || !user || !api) return false
    for (const part of splitMessage(`${title}\n\n${text}`)) await api.sendMessage(user, part)
    return true
  }

  // ---- Os cards ----------------------------------------------------------------------------------

  /** Um card apareceu: vai para o Telegram na hora (conversando por lá, ou tela bloqueada) ou depois. */
  request(id: string, toolName: string, input: unknown): void {
    const user = this.deps.user()
    if (!this.deps.enabled() || !user || this.cards.has(id)) return
    const summary = summarize(toolName, input)
    if (!summary) return
    const card: Card = {
      id,
      allow: summary.denyOnly ? null : ticket(),
      deny: ticket(),
      timer: null
    }
    this.cards.set(id, card)
    const go = (): void => {
      card.timer = null
      if (!this.cards.has(id)) return
      const buttons: Button[] = [
        ...(card.allow
          ? [
              {
                text: summary.plan ? t('Aprovar o plano') : t('Permitir uma vez'),
                callback_data: `a:${card.allow}`
              }
            ]
          : []),
        {
          text: summary.plan ? t('Continuar planejando') : t('Negar'),
          callback_data: `d:${card.deny}`
        }
      ]
      void this.deps
        .api()
        ?.sendMessage(user, `${summary.title}\n\n${summary.text}`, [buttons])
        .then((sent) => {
          card.chat = user
          card.message = sent.message_id
        })
        .catch((err: Error) => this.deps.log?.(err.message))
    }
    const recent = this.now() - this.lastTalk < RECENT_MS
    if (recent || this.deps.locked()) go()
    else card.timer = setTimeout(go, this.deps.afterMs())
  }

  /** O card foi respondido (aqui ou no computador): a mensagem diz e os botões somem. */
  resolved(id: string, how = t('Respondido no computador.')): void {
    const card = this.cards.get(id)
    if (!card) return
    this.cards.delete(id)
    if (card.timer) clearTimeout(card.timer)
    if (card.chat && card.message) {
      void this.deps
        .api()
        ?.editMessage(card.chat, card.message, how)
        .catch(() => {})
    }
  }

  private async callback(query: NonNullable<TgUpdate['callback_query']>): Promise<void> {
    const api = this.deps.api()
    if (!api) return
    if (!this.deps.enabled() || query.from.id !== this.deps.user()) {
      await api.answerCallback(query.id, '').catch(() => {})
      return
    }
    const [kind, value] = (query.data ?? '').split(':')
    const card = [...this.cards.values()].find(
      (item) => (kind === 'a' && item.allow === value) || (kind === 'd' && item.deny === value)
    )
    if (!card) {
      await api.answerCallback(query.id, t('Esse pedido já foi respondido.')).catch(() => {})
      return
    }
    const decision: PhoneDecision = kind === 'a' ? 'allow' : 'deny'
    // Sai da lista antes de responder: a resposta avisa o "respondido" na hora, e a mensagem
    // tem de dizer como foi, daqui.
    this.cards.delete(card.id)
    if (card.timer) clearTimeout(card.timer)
    const ok = this.deps.answer(card.id, decision)
    const how = ok
      ? decision === 'allow'
        ? t('Permitido (uma vez).')
        : t('Negado.')
      : t('Já tinha sido respondido.')
    if (card.chat && card.message) {
      await api.editMessage(card.chat, card.message, how).catch(() => {})
    }
    await api.answerCallback(query.id, ok ? t('Feito.') : how).catch(() => {})
  }
}

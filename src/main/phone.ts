// Aprovar pelo celular (Fase 18), pelo ntfy (ntfy.sh ou um servidor seu) e o app dele no celular.
//
// O canal são dois tópicos sorteados no pareamento (128 bits cada): o dos pedidos, que o celular
// assina, e o das respostas, que só o Wisp escuta. Cada pedido leva dois botões do ntfy ("http":
// o próprio celular publica o corpo no tópico das respostas), e cada corpo é uma ficha de uso
// único, sorteada para aquele card: uma para Permitir e outra para Negar. Quem não sabe os
// tópicos não vê nem responde nada; uma ficha velha ou de outro card não vale.
//
// As regras:
// - desligado por padrão; liga só depois de o celular responder ao teste do pareamento;
// - vai com a tela bloqueada ou com o card esperando há um tempo (phoneAfterSeconds);
// - um pedido por vez; expira em 2 minutos e, sem resposta, fica negado;
// - só Permitir e Negar: nada de "sempre", de trocar o modo nem de responder perguntas; a
//   confiança numa pasta espera o computador; um comando que mexe com segredos só se nega;
// - no canal, só o resumo do pedido (cortado), nunca a conversa;
// - a escuta das respostas só fica aberta com um pedido no celular (parado, nada roda).

import { randomBytes } from 'crypto'
import { basename } from 'path'
import { BROWSER_PREFIX } from './browser-policy'
import { touchesSecrets } from './permission-scope'
import { QUESTION_TOOL } from './questions'
import { t } from '../shared/i18n'

export const PHONE_SECRET = 'phone'
/** O servidor do ntfy de quem não tem um. */
export const DEFAULT_PHONE_SERVER = 'https://ntfy.sh'
/** Quanto um pedido no celular espera a resposta (ms) antes de ficar negado. */
export const PHONE_EXPIRY_MS = 120_000
/** O tamanho máximo do resumo de um pedido no canal. */
const MAX_SUMMARY = 160
/** Depois de uma queda da escuta, quanto esperar para tentar de novo (ms). */
const RETRY_MS = 3000

// Os mesmos da conversation.ts (importar de lá traria o node-pty para cá).
const PLAN_TOOL = 'ExitPlanMode'
const TRUST_TOOL = 'wisp_trust_folder'
const TOPIC = /^[A-Za-z0-9_-]{8,64}$/

/** O canal com o celular: o servidor, os dois tópicos e a ficha de acesso (servidor próprio). */
export interface PhoneChannel {
  server: string
  /** O tópico dos pedidos (o celular assina este). */
  requests: string
  /** O tópico das respostas (os botões do celular publicam nele). */
  replies: string
  /** A ficha de acesso do ntfy (tk_…), para um servidor com login; null no público. */
  token: string | null
}

/** O endereço de um servidor do ntfy, sem a barra do fim; null se não é http ou https. */
export function normalizeServer(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.search || url.hash) return null
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

const randomTopic = (): string => `wisp-${randomBytes(16).toString('hex')}`
const randomTicket = (): string => randomBytes(16).toString('hex')

/** Um canal novo, com tópicos sorteados. */
export function newChannel(server: string, token: string | null): PhoneChannel {
  return { server, requests: randomTopic(), replies: randomTopic(), token: token || null }
}

/** O canal guardado no chaveiro (null se não é um canal). */
export function parseChannel(text: string | null): PhoneChannel | null {
  if (!text) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const { server, requests, replies, token } = value as Record<string, unknown>
  if (typeof server !== 'string' || normalizeServer(server) !== server) return null
  if (typeof requests !== 'string' || !TOPIC.test(requests)) return null
  if (typeof replies !== 'string' || !TOPIC.test(replies) || replies === requests) return null
  if (token !== null && (typeof token !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(token))) {
    return null
  }
  return { server, requests, replies, token }
}

/** O link que o app do ntfy abre para assinar o tópico dos pedidos (o QR code do pareamento). */
export function subscribeLink(channel: PhoneChannel): string {
  const url = new URL(channel.server)
  const path = url.pathname.replace(/\/+$/, '')
  const insecure = url.protocol === 'http:' ? '?secure=false' : ''
  return `ntfy://${url.host}${path}/${channel.requests}${insecure}`
}

/** O mesmo tópico no navegador (o app web do ntfy). */
export function webLink(channel: PhoneChannel): string {
  return `${channel.server}/${channel.requests}`
}

/** O que vai para o celular sobre um pedido; null quando ele não vai (espera o computador). */
export interface PhoneSummary {
  title: string
  text: string
  /** Só dá para negar pelo celular (um comando que mexe com segredos). */
  denyOnly: boolean
  /** É o plano: os botões são Aprovar e Continuar planejando. */
  plan: boolean
}

const cut = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAX_SUMMARY ? `${line.slice(0, MAX_SUMMARY - 1)}…` : line
}

const field = (input: unknown, key: string): string | null => {
  if (!input || typeof input !== 'object') return null
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

const hostOf = (url: string | null): string | null => {
  if (!url) return null
  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}

/** O resumo de um pedido de permissão para o celular. */
export function summarize(toolName: string, input: unknown): PhoneSummary | null {
  if (toolName === QUESTION_TOOL || toolName === TRUST_TOOL) return null
  const base = { denyOnly: false, plan: false }
  if (toolName === PLAN_TOOL) {
    return {
      ...base,
      plan: true,
      title: t('O Claude quer seguir com o plano'),
      text: t('Veja o plano no computador; daqui dá para aprovar ou continuar planejando.')
    }
  }
  if (toolName === 'Bash') {
    const command = field(input, 'command') ?? ''
    if (touchesSecrets(command)) {
      return {
        ...base,
        denyOnly: true,
        title: t('O Claude quer rodar um comando'),
        text: t(
          'O comando mexe com arquivos de segredos: veja no computador. Daqui, só dá para negar.'
        )
      }
    }
    return { ...base, title: t('O Claude quer rodar um comando'), text: cut(command) || 'Bash' }
  }
  if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write') {
    const path = field(input, 'file_path')
    const verb = toolName === 'Write' ? t('escrever') : t('editar')
    return {
      ...base,
      title: t('O Claude quer {verb} um arquivo', { verb }),
      text: cut(path ? basename(path) : toolName)
    }
  }
  if (toolName === 'NotebookEdit') {
    const path = field(input, 'notebook_path')
    return {
      ...base,
      title: t('O Claude quer editar um notebook'),
      text: cut(path ? basename(path) : toolName)
    }
  }
  if (toolName === 'WebFetch') {
    return {
      ...base,
      title: t('O Claude quer abrir uma página'),
      text: cut(hostOf(field(input, 'url')) ?? 'WebFetch')
    }
  }
  if (toolName.startsWith(BROWSER_PREFIX)) {
    const site = hostOf(field(input, 'url'))
    const action = toolName
      .slice(BROWSER_PREFIX.length)
      .replace(/^browser_/, '')
      .replace(/_/g, ' ')
    return {
      ...base,
      title: t('O Claude quer usar o navegador'),
      text: cut(site ? `${action}: ${site}` : action)
    }
  }
  const tool = toolName.startsWith('mcp__')
    ? toolName.split('__').slice(2).join('__') || toolName
    : toolName
  return { ...base, title: t('O Claude quer usar uma ferramenta'), text: cut(tool) }
}

// ---- O ntfy ----------------------------------------------------------------------------------

type Fetch = typeof fetch

/** Uma mensagem para o tópico dos pedidos, com os botões (cada um publica a sua ficha). */
export interface PhoneMessage {
  title: string
  message: string
  priority?: number
  tags?: string[]
  buttons?: { label: string; ticket: string }[]
}

const headers = (channel: PhoneChannel): Record<string, string> =>
  channel.token ? { authorization: `Bearer ${channel.token}` } : {}

/** O corpo do POST do ntfy (a publicação em JSON). */
export function publishBody(channel: PhoneChannel, message: PhoneMessage): Record<string, unknown> {
  return {
    topic: channel.requests,
    title: message.title,
    message: message.message,
    ...(message.priority ? { priority: message.priority } : {}),
    ...(message.tags ? { tags: message.tags } : {}),
    ...(message.buttons?.length
      ? {
          actions: message.buttons.map((button) => ({
            action: 'http',
            label: button.label,
            url: `${channel.server}/${channel.replies}`,
            method: 'POST',
            headers: headers(channel),
            body: button.ticket,
            clear: true
          }))
        }
      : {})
  }
}

/** Publica no tópico dos pedidos. Lança um erro em português se o servidor não aceitou. */
export async function publish(
  channel: PhoneChannel,
  message: PhoneMessage,
  fetcher: Fetch = fetch
): Promise<void> {
  let response: Response
  try {
    response = await fetcher(`${channel.server}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers(channel) },
      body: JSON.stringify(publishBody(channel, message)),
      signal: AbortSignal.timeout(15_000)
    })
  } catch (err) {
    throw new Error(
      t('Não consegui falar com o ntfy ({message}).', { message: (err as Error).message }),
      { cause: err }
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(t('O ntfy recusou o acesso: confira a ficha de acesso do servidor.'))
  }
  if (!response.ok) throw new Error(t('O ntfy respondeu {status}.', { status: response.status }))
}

/**
 * Escuta o tópico das respostas (o stream em JSON do ntfy) até o sinal abortar, chamando
 * onMessage com o texto de cada mensagem. Caiu, tenta de novo, desde a hora em que começou.
 */
export async function listen(
  channel: PhoneChannel,
  onMessage: (text: string) => void,
  signal: AbortSignal,
  fetcher: Fetch = fetch,
  onError: (err: Error) => void = () => {}
): Promise<void> {
  const since = Math.floor(Date.now() / 1000) - 1
  while (!signal.aborted) {
    try {
      const response = await fetcher(`${channel.server}/${channel.replies}/json?since=${since}`, {
        headers: headers(channel),
        signal
      })
      if (!response.ok || !response.body)
        throw new Error(t('o ntfy respondeu {status}', { status: response.status }))
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim()
          buffer = buffer.slice(end + 1)
          if (!line) continue
          try {
            const event = JSON.parse(line) as { event?: string; message?: unknown }
            if (event.event === 'message' && typeof event.message === 'string') {
              onMessage(event.message.trim())
            }
          } catch {
            // Uma linha que não é JSON: o ntfy não manda isso; ignora.
          }
        }
      }
    } catch (err) {
      if (signal.aborted) return
      onError(err as Error)
    }
    if (signal.aborted) return
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, RETRY_MS)
      signal.addEventListener('abort', () => (clearTimeout(timer), resolve(null)), { once: true })
    })
  }
}

/**
 * O teste do pareamento: manda uma notificação com o botão Confirmar e espera o celular
 * responder. Resolve true quando ele responde, false quando o tempo acaba ou o sinal aborta.
 */
export async function confirmPairing(
  channel: PhoneChannel,
  timeoutMs: number,
  signal: AbortSignal,
  fetcher: Fetch = fetch
): Promise<boolean> {
  const ticket = randomTicket()
  const stop = new AbortController()
  const abort = (): void => stop.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const confirmed = new Promise<boolean>((resolve) => {
      stop.signal.addEventListener('abort', () => resolve(false), { once: true })
      void listen(channel, (text) => text === ticket && resolve(true), stop.signal, fetcher)
    })
    await publish(
      channel,
      {
        title: t('Wisp: parear este celular'),
        message: t('Toque em Confirmar para o Wisp poder pedir aprovações por aqui.'),
        tags: ['iphone'],
        buttons: [{ label: t('Confirmar'), ticket }]
      },
      fetcher
    )
    return await confirmed
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    stop.abort()
  }
}

// ---- Os pedidos -----------------------------------------------------------------------------

export type PhoneDecision = 'allow' | 'deny'

export interface PhoneDeps {
  /** A função está ligada (e pareada). */
  enabled(): boolean
  /** Quanto um card espera antes de ir para o celular (ms); 0: só com a tela bloqueada. */
  afterMs(): number
  /** O canal (lido do chaveiro ao ligar); null sem pareamento. */
  channel(): PhoneChannel | null
  /** Responde o card. Devolve false se ele já não estava esperando. */
  answer(id: string, decision: PhoneDecision, how: 'phone' | 'expired'): boolean
  /** Quanto um pedido no celular espera (ms). */
  expiryMs?: number
  fetch?: Fetch
  log?(message: string): void
}

interface Waiting {
  id: string
  summary: PhoneSummary
  /** Já esperou o phoneAfterSeconds (marcado pelo próprio timer). */
  due: boolean
  timer: NodeJS.Timeout | null
}

interface Active {
  id: string
  summary: PhoneSummary
  allow: string | null
  deny: string
  stop: AbortController
  expiry: NodeJS.Timeout
  /** Como acabou (para a mensagem de confirmação no celular). */
  outcome: string | null
}

/** Os cards que esperam e o que está no celular (um por vez). */
export class PhoneApprovals {
  private readonly waiting = new Map<string, Waiting>()
  private active: Active | null = null
  private locked = false

  constructor(private readonly deps: PhoneDeps) {}

  /** Um card apareceu. */
  request(id: string, toolName: string, input: unknown): void {
    if (!this.deps.enabled() || this.waiting.has(id)) return
    const summary = summarize(toolName, input)
    if (!summary) return
    const after = this.deps.afterMs()
    const entry: Waiting = { id, summary, due: false, timer: null }
    // O próprio timer marca a hora: comparar com o Date.now() falharia quando ele dispara um
    // milissegundo antes, e o card nunca iria.
    if (after > 0) {
      entry.timer = setTimeout(() => {
        entry.due = true
        this.pump()
      }, after)
    }
    this.waiting.set(id, entry)
    this.pump()
  }

  /** O card foi respondido (aqui, no computador, ou cancelado). */
  resolved(id: string): void {
    const entry = this.waiting.get(id)
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer)
      this.waiting.delete(id)
    }
    if (this.active?.id === id) {
      const active = this.active
      this.active = null
      clearTimeout(active.expiry)
      active.stop.abort()
      this.confirm(active.outcome ?? t('Respondido no computador.'))
      this.pump()
    }
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    if (locked) this.pump()
  }

  /** Desligou ou desfez o pareamento: nada mais vai, e o que estava no celular deixa de valer. */
  reset(): void {
    for (const entry of this.waiting.values()) if (entry.timer) clearTimeout(entry.timer)
    this.waiting.clear()
    if (this.active) {
      clearTimeout(this.active.expiry)
      this.active.stop.abort()
      this.active = null
    }
  }

  /** O que está no celular agora (para os testes). */
  current(): string | null {
    return this.active?.id ?? null
  }

  private eligible(entry: Waiting): boolean {
    return this.locked || entry.due
  }

  /** Manda o card mais antigo que já pode ir, se nenhum está no celular. */
  private pump(): void {
    if (this.active || !this.deps.enabled()) return
    const channel = this.deps.channel()
    if (!channel) return
    const next = [...this.waiting.values()].find((entry) => this.eligible(entry))
    if (!next) return
    if (next.timer) clearTimeout(next.timer)
    this.waiting.delete(next.id)
    this.send(channel, next)
  }

  private send(channel: PhoneChannel, entry: Waiting): void {
    const expiryMs = this.deps.expiryMs ?? PHONE_EXPIRY_MS
    const active: Active = {
      id: entry.id,
      summary: entry.summary,
      allow: entry.summary.denyOnly ? null : randomTicket(),
      deny: randomTicket(),
      stop: new AbortController(),
      expiry: setTimeout(() => {
        if (this.active !== active) return
        active.outcome = t('Expirou: ficou negado.')
        // O card fica negado; o resolved que vem dele limpa o resto.
        if (!this.deps.answer(active.id, 'deny', 'expired')) this.resolved(active.id)
      }, expiryMs),
      outcome: null
    }
    this.active = active
    const fetcher = this.deps.fetch ?? fetch
    void listen(
      channel,
      (text) => {
        if (this.active !== active) return
        const decision = text === active.allow ? 'allow' : text === active.deny ? 'deny' : null
        if (!decision) return
        // A ficha é de uso único: depois desta, nenhuma outra vale para o card.
        active.allow = null
        active.deny = randomTicket()
        active.outcome = decision === 'allow' ? t('Permitido.') : t('Negado.')
        if (!this.deps.answer(active.id, decision, 'phone')) this.resolved(active.id)
      },
      active.stop.signal,
      fetcher,
      (err) => this.deps.log?.(t('a escuta do ntfy caiu: {message}', { message: err.message }))
    )
    const minutes = Math.round(expiryMs / 60_000)
    const { summary } = entry
    const buttons = summary.plan
      ? [
          { label: t('Aprovar'), ticket: active.allow! },
          { label: t('Continuar planejando'), ticket: active.deny }
        ]
      : [
          ...(active.allow ? [{ label: t('Permitir'), ticket: active.allow }] : []),
          { label: t('Negar'), ticket: active.deny }
        ]
    void publish(
      channel,
      {
        title: `Wisp: ${summary.title}`,
        message: `${summary.text}\n\nSem resposta em ${minutes > 0 ? `${minutes} min` : t('instantes')}, fica negado.`,
        priority: 4,
        tags: ['robot'],
        buttons
      },
      fetcher
    ).catch((err: Error) => {
      // Não chegou ao celular: o card continua no computador, como se nada tivesse ido.
      this.deps.log?.(t('não mandei o pedido para o celular: {message}', { message: err.message }))
      if (this.active !== active) return
      this.active = null
      clearTimeout(active.expiry)
      active.stop.abort()
    })
  }

  /** Um aviso baixinho no celular de como o pedido acabou. */
  private confirm(text: string): void {
    const channel = this.deps.channel()
    if (!channel) return
    void publish(
      channel,
      { title: 'Wisp', message: text, priority: 2 },
      this.deps.fetch ?? fetch
    ).catch(() => {})
  }
}

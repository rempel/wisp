// A agenda por endereço (Fase 40): o endereço iCal de uma agenda do Google, do Outlook ou do
// iCloud ("endereço secreto em formato iCal", "publicar a agenda"). É o que dá a agenda no
// Windows, que não tem as agendas do GNOME, e serve no Linux também.
//
// O endereço é um segredo (quem o tem lê a agenda): fica no chaveiro do sistema, um por agenda,
// e o config.json guarda só o nome e o id (calendarLinks). Ele nunca vai para o registro nem para
// as mensagens de erro. A rede é só para esse endereço, só https, de 15 em 15 minutos no máximo
// (e com o ETag, quando o servidor dá: sem mudança, não baixa de novo).

import { randomBytes } from 'crypto'
import { t } from '../shared/i18n'

/** O nome do segredo de cada endereço no chaveiro. */
export const linkSecret = (id: string): string => `calendar-link-${id}`
/** Quantas agendas por endereço, no máximo. */
export const MAX_LINKS = 10
/** De quanto em quanto tempo, no mínimo, baixa de novo a mesma agenda (ms). */
export const LINK_REFRESH_MS = 15 * 60_000
/** Quanto espera pela resposta. */
const TIMEOUT_MS = 20_000
/** O tamanho máximo de uma agenda (um ano de reuniões cabe com folga). */
const MAX_BYTES = 5 * 1024 * 1024

/** Uma agenda por endereço, como fica no config.json. */
export interface CalendarLink {
  id: string
  name: string
}

/** O que a agenda lê (o mesmo formato dos arquivos .ics). */
export interface LinkSource {
  calendar: string
  texts: string[]
  error?: string
}

/** Um id novo para uma agenda por endereço. */
export const newLinkId = (): string => randomBytes(4).toString('hex')

/**
 * O endereço conferido: só https (o webcal:// das agendas é o mesmo endereço por https), sem
 * usuário e senha no endereço. null se não serve.
 */
export function normalizeCalendarUrl(text: string): string | null {
  const typed = text.trim()
  if (!typed || typed.length > 2000) return null
  let url: URL
  try {
    url = new URL(typed.replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
  return url.toString()
}

/** Um nome para a agenda quando ninguém deu um: o do serviço, pelo endereço. */
export function defaultLinkName(url: string): string {
  const host = new URL(url).hostname.toLowerCase()
  if (host.endsWith('google.com')) return 'Google'
  if (host.endsWith('outlook.office365.com') || host.endsWith('outlook.live.com')) return 'Outlook'
  if (host.endsWith('icloud.com')) return 'iCloud'
  return host.replace(/^www\./, '')
}

/** O texto parece uma agenda iCal? */
export const looksLikeCalendar = (text: string): boolean =>
  /^\s*BEGIN:VCALENDAR/i.test(text.replace(/^\uFEFF/, ''))

interface Cached {
  text: string
  at: number
  etag: string | null
}

export interface CalendarFeedsOptions {
  /** O endereço guardado no chaveiro; null se não estiver lá. */
  secret(id: string): Promise<string | null>
  fetch?: typeof fetch
  now?: () => number
}

/** Baixa as agendas por endereço, guardando a última de cada uma. */
export class CalendarFeeds {
  private cache = new Map<string, Cached>()

  constructor(private readonly options: CalendarFeedsOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** As agendas da lista, cada uma baixada de novo se a última tiver mais de 15 minutos. */
  async read(links: CalendarLink[]): Promise<LinkSource[]> {
    // Uma agenda que saiu da lista sai do que está guardado.
    const ids = new Set(links.map((link) => link.id))
    for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id)
    return Promise.all(links.map((link) => this.readOne(link)))
  }

  /** Esquece o que foi baixado de uma agenda (o endereço mudou). */
  forget(id: string): void {
    this.cache.delete(id)
  }

  private async readOne(link: CalendarLink): Promise<LinkSource> {
    const cached = this.cache.get(link.id)
    if (cached && this.now() - cached.at < LINK_REFRESH_MS) {
      return { calendar: link.name, texts: [cached.text] }
    }
    let url: string | null
    try {
      url = await this.options.secret(link.id)
    } catch (err) {
      return this.stale(link, cached, (err as Error).message)
    }
    if (!url) {
      return {
        calendar: link.name,
        texts: [],
        error: t('O endereço da agenda "{name}" não está no chaveiro: guarde-o de novo.', {
          name: link.name
        })
      }
    }
    const result = await downloadCalendar(url, this.options.fetch, cached?.etag ?? null)
    if ('error' in result) return this.stale(link, cached, result.error)
    if (result.notModified && cached) {
      cached.at = this.now()
      return { calendar: link.name, texts: [cached.text] }
    }
    if (result.notModified) return this.stale(link, cached, t('o servidor não mandou a agenda'))
    this.cache.set(link.id, { text: result.text, at: this.now(), etag: result.etag })
    return { calendar: link.name, texts: [result.text] }
  }

  /** Não deu para baixar: fica a última que veio (se houver), com o aviso. */
  private stale(link: CalendarLink, cached: Cached | undefined, why: string): LinkSource {
    return {
      calendar: link.name,
      texts: cached ? [cached.text] : [],
      error: t('A agenda "{name}" não atualizou: {why}', { name: link.name, why })
    }
  }
}

export type DownloadResult =
  | { text: string; etag: string | null; notModified?: false }
  | { notModified: true }
  /** `offline`: não deu para falar com o servidor (sem rede, ou ele não respondeu). */
  | { error: string; offline?: boolean }

/**
 * Baixa uma agenda. O erro nunca traz o endereço (ele é o segredo): só o que deu errado. Um
 * redirecionamento para fora do https não é seguido.
 */
export async function downloadCalendar(
  url: string,
  fetcher: typeof fetch = fetch,
  etag: string | null = null
): Promise<DownloadResult> {
  let response: Response
  try {
    response = await fetcher(url, {
      headers: {
        Accept: 'text/calendar, */*;q=0.5',
        'User-Agent': 'Wisp',
        ...(etag ? { 'If-None-Match': etag } : {})
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'TimeoutError' || name === 'AbortError')
      return { error: t('o servidor não respondeu'), offline: true }
    return { error: t('sem conexão com o servidor da agenda'), offline: true }
  }
  if (response.url && !response.url.startsWith('https://')) {
    return { error: t('o endereço levou para fora do https') }
  }
  if (response.status === 304) return { notModified: true }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { error: t('o servidor recusou o endereço (ele mudou ou deixou de ser público?)') }
  }
  if (!response.ok)
    return { error: t('o servidor respondeu {status}', { status: response.status }) }
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return { error: t('a agenda passa de 5 MB') }
  const text = await readLimited(response, MAX_BYTES)
  if (text === null) return { error: t('a agenda passa de 5 MB') }
  if (!looksLikeCalendar(text)) return { error: t('o endereço não é de uma agenda iCal') }
  return { text, etag: response.headers.get('etag') }
}

/** O corpo da resposta em texto, até `max` bytes; null se passar. */
async function readLimited(response: Response, max: number): Promise<string | null> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

import type { ChatEvent } from '../shared/ipc'

// As permissões do navegador do Claude, por site e por conversa, para não virar um card a cada
// clique:
// - ler a página (snapshot, print, console, abas) passa direto;
// - abrir um site pede; o card oferece "Permitir em <site> nesta conversa";
// - clicar, digitar e preencher passam direto no site já liberado e pedem nos outros;
// - rodar código na página e enviar arquivos pedem sempre, sem o "sempre".

export const BROWSER_PREFIX = 'mcp__playwright__'
/** O chat guarda até 4000 caracteres de cada resultado (claude.ts). */
const TRUNCATED_AT = 3990

/** Só leem o que está aberto. */
const READ = new Set([
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_console_messages',
  'browser_network_requests',
  'browser_network_request',
  'browser_find',
  'browser_wait_for',
  'browser_resize',
  'browser_emulate_media',
  'browser_close',
  // Volta para uma página que já foi aberta.
  'browser_navigate_back'
])

/** Mexem na página aberta: valem no site liberado. */
const INTERACT = new Set([
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_select_option',
  'browser_hover',
  'browser_drag',
  'browser_press_key',
  'browser_handle_dialog'
])

/** Código na página e arquivos do computador: um card a cada vez. */
const DANGER = new Set([
  'browser_evaluate',
  'browser_run_code_unsafe',
  'browser_file_upload',
  'browser_drop'
])

/**
 * Respostas em que a página pode escrever fora dos blocos de código (mensagens do console,
 * requisições, o retorno de um script): não servem para saber em que página o navegador está.
 */
const UNTRUSTED_OUTPUT = new Set([
  'browser_console_messages',
  'browser_network_requests',
  'browser_network_request',
  'browser_find',
  'browser_evaluate',
  'browser_run_code_unsafe'
])

/** O que fazer com um pedido do navegador. */
export type BrowserVerdict =
  | { allow: true }
  | {
      allow: false
      /** O site em jogo (para o card e para o "Permitir neste site"); null se não se sabe. */
      site: string | null
      /** O card pode oferecer "Permitir em <site> nesta conversa". */
      always: boolean
    }

/** O site de um endereço http(s): o host em minúsculas, sem "www.". null para o resto. */
export function siteOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  return host.replace(/^www\./, '') || null
}

/**
 * A página aberta, pela seção "### Page" da resposta do Playwright, cuja primeira linha é
 * "- Page URL: …". Devolve o endereço, null se a resposta não diz, ou 'unknown' se ela pode
 * estar adulterada.
 *
 * A página consegue escrever em partes da resposta: o texto de um alert() vai cru, com quebras
 * de linha, na seção "### Modal state", que vem depois da "### Page"; e uma mensagem de erro pode
 * citar a página. Por isso valem só a seção "### Page" de verdade (uma só, antes de "### Modal
 * state", fora dos blocos de código) e nenhuma depois de um "### Error".
 */
export function currentPageUrl(output: string): string | null | 'unknown' {
  let fenced = false
  let pages = 0
  let afterPage = false
  let url: string | null = null
  for (const line of output.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (afterPage) {
      afterPage = false
      const match = /^- Page URL: (\S+)$/.exec(line)
      if (match) url = match[1]
    }
    if (!line.startsWith('### ')) continue
    const title = line.trim()
    if (title === '### Error') return 'unknown'
    // Daqui para a frente, só o que a página pode ter escrito (diálogos, snapshot).
    if (title === '### Modal state' || title === '### Snapshot') break
    if (title === '### Page') {
      pages++
      afterPage = true
    }
  }
  return pages > 1 ? 'unknown' : url
}

const field = (input: unknown, key: string): string => {
  const value = (input as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : ''
}

export class BrowserPolicy {
  /** Sites liberados nesta conversa (valem também para os subdomínios). */
  private readonly sites = new Set<string>()
  /** O site da página aberta, pela última resposta confiável; null se não se sabe. */
  private current: string | null = null
  /** Chamada → nome da ferramenta, para saber de quem é cada resultado. */
  private readonly names = new Map<string, string>()

  /** A conversa recomeçou: nada liberado, página desconhecida. */
  reset(): void {
    this.sites.clear()
    this.current = null
    this.names.clear()
  }

  allowSite(site: string): void {
    this.sites.add(site)
  }

  /** O site aberto agora (para o card mostrar onde vai o clique). */
  get page(): string | null {
    return this.current
  }

  private allowed(site: string | null): boolean {
    if (!site) return false
    for (const allowed of this.sites) {
      if (site === allowed || site.endsWith(`.${allowed}`)) return true
    }
    return false
  }

  /** Acompanha a conversa: de que ferramenta é cada resultado e em que página o navegador está. */
  track(event: ChatEvent): void {
    if (event.type === 'reset') return this.reset()
    if (event.type === 'tool-input' || event.type === 'tool-start') {
      if (event.name.startsWith(BROWSER_PREFIX)) this.names.set(event.id, event.name)
      return
    }
    if (event.type !== 'tool-result') return
    const name = this.names.get(event.id)
    if (!name) return
    this.names.delete(event.id)
    const tool = name.slice(BROWSER_PREFIX.length)
    if (UNTRUSTED_OUTPUT.has(tool)) {
      // Um script pode ter navegado: a página passa a ser desconhecida.
      if (tool === 'browser_evaluate' || tool === 'browser_run_code_unsafe') this.current = null
      return
    }
    const url = currentPageUrl(event.output)
    if (url === 'unknown') this.current = null
    else if (url) this.current = url === 'about:blank' ? null : siteOf(url)
    // Sem a seção da página numa resposta cortada (o chat guarda só o começo): pode ter havido
    // uma navegação que não dá para ver, então a página passa a ser desconhecida.
    else if (event.output.length >= TRUNCATED_AT) this.current = null
  }

  /** O que fazer com uma chamada do navegador. */
  check(toolName: string, input: unknown): BrowserVerdict {
    const tool = toolName.slice(BROWSER_PREFIX.length)
    if (tool === 'browser_navigate' || (tool === 'browser_tabs' && field(input, 'url'))) {
      const url = field(input, 'url')
      if (url === 'about:blank') return { allow: true }
      const site = siteOf(url)
      return this.allowed(site) ? { allow: true } : { allow: false, site, always: site !== null }
    }
    if (tool === 'browser_tabs' || READ.has(tool)) return { allow: true }
    if (INTERACT.has(tool)) {
      return this.allowed(this.current)
        ? { allow: true }
        : { allow: false, site: this.current, always: this.current !== null }
    }
    // DANGER e ferramentas que este Wisp não conhece.
    return { allow: false, site: this.current, always: false }
  }
}

/** Ferramentas que sempre pedem (o card não oferece "sempre"). */
export function isDangerous(toolName: string): boolean {
  return DANGER.has(toolName.slice(BROWSER_PREFIX.length))
}

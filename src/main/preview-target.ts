// O que a pré-visualização abre (Fases 47 e 58): um endereço desta máquina, um arquivo (HTML,
// PDF, imagem ou Markdown) ou, com a opção ligada, um site; e para onde a página pode navegar.
// Tudo puro: o preview.ts cuida das vistas.

import { existsSync, statSync } from 'fs'
import { dirname, extname, isAbsolute, resolve } from 'path'
import { pathToFileURL } from 'url'
import { isSensitivePath } from './claude-settings'
import { expandHome } from './paths'
import { t } from '../shared/i18n'

/** As extensões que a janela mostra (o Markdown vai para o painel). */
export const PREVIEW_EXTENSIONS = [
  '.html',
  '.htm',
  '.pdf',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp'
]
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown']
/** Os nomes desta máquina. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

export type PreviewTarget =
  | { kind: 'url'; url: string; display: string }
  | { kind: 'file'; path: string; url: string; display: string }
  | { kind: 'markdown'; path: string; display: string }

/**
 * O que abrir, a partir do que a pessoa (ou um card) deu: um endereço desta máquina
 * (http://localhost:5173, localhost:3000, :8080), ou um arquivo (absoluto, com ~ ou relativo à
 * pasta da conversa). Devolve uma string com o motivo quando não dá.
 */
export function previewTarget(
  input: string,
  base: string | null,
  home?: string,
  web = false
): PreviewTarget | string {
  const raw = input.trim()
  if (!raw) return t('Diga o endereço ou o arquivo.')
  const port = /^(?:localhost)?:(\d{2,5})(\/.*)?$/.exec(raw) ?? /^(\d{2,5})$/.exec(raw)
  if (port) return localUrl(`http://localhost:${port[1]}${port[2] ?? '/'}`)
  if (/^localhost(:\d+)?(\/|$)/.test(raw)) return localUrl(`http://${raw}`)
  if (/^https?:\/\//i.test(raw)) return localUrl(raw, web)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return t('Só endereços http e https, e arquivos.')
  const expanded = expandHome(raw.replace(/^file:\/\//, ''))
  const root = base ? expandHome(base) : null
  // Um site sem o https:// na frente ("exemplo.com/docs"), se não for um arquivo da pasta.
  if (web && looksLikeSite(raw) && !(root && existsSync(resolve(root, expanded)))) {
    return localUrl(`https://${raw}`, web)
  }
  if (!isAbsolute(expanded) && !root) return t('Use o caminho inteiro do arquivo.')
  const path = isAbsolute(expanded) ? expanded : resolve(root as string, expanded)
  if (isSensitivePath(path, home)) return t('Este arquivo guarda segredos: o painel não mostra.')
  let file: boolean
  try {
    file = statSync(path).isFile()
  } catch {
    return t('O arquivo não existe (ou não dá para ler).')
  }
  if (!file) return t('Não é um arquivo.')
  const ext = extname(path).toLowerCase()
  if (MARKDOWN_EXTENSIONS.includes(ext)) return { kind: 'markdown', path, display: path }
  if (!PREVIEW_EXTENSIONS.includes(ext)) {
    return t('A pré-visualização mostra HTML, PDF, imagens e Markdown.')
  }
  return { kind: 'file', path, url: pathToFileURL(path).href, display: path }
}

/** O aviso de quando as páginas da internet estão desligadas nas configurações. */
const WEB_OFF = (): string =>
  t(
    'Só arquivos e endereços desta máquina (localhost): as páginas da internet estão desligadas nas configurações.'
  )

/** Parece o endereço de um site ("exemplo.com", "docs.exemplo.com/guia"), e não um arquivo? */
export function looksLikeSite(raw: string): boolean {
  const match = /^((?:[a-z0-9-]+\.)+([a-z]{2,}))(?::\d+)?(?:[/?#].*)?$/i.exec(raw)
  if (!match) return false
  // "index.html" e "notas.md" têm cara de domínio, mas são arquivos.
  const ending = `.${match[2].toLowerCase()}`
  return !PREVIEW_EXTENSIONS.includes(ending) && !MARKDOWN_EXTENSIONS.includes(ending)
}

/** O endereço é desta máquina (localhost)? */
export function isLocalAddress(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'file:' || LOCAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function localUrl(raw: string, web = false): PreviewTarget | string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return t('Esse endereço não é válido.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return t('Só endereços http e https, e arquivos.')
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    // Uma página da internet (Fase 58): só com a opção ligada nas configurações.
    return web ? { kind: 'url', url: url.href, display: url.href } : WEB_OFF()
  }
  // O 0.0.0.0 de um servidor de desenvolvimento quer dizer "todas as interfaces": abre por aqui.
  if (url.hostname === '0.0.0.0') url.hostname = 'localhost'
  return { kind: 'url', url: url.href, display: url.href }
}

/**
 * Uma navegação dentro da página vale? Com as páginas da internet ligadas (`web`), qualquer
 * endereço http ou https; sem elas, só o mesmo servidor. De um arquivo, outro arquivo da pasta
 * dele (e nunca de um endereço para um arquivo).
 */
export function allowedNavigation(target: PreviewTarget, next: string, web = false): boolean {
  let url: URL
  try {
    url = new URL(next)
  } catch {
    return false
  }
  if (web && (url.protocol === 'http:' || url.protocol === 'https:')) return true
  if (target.kind === 'url') return url.origin === new URL(target.url).origin
  if (target.kind !== 'file' || url.protocol !== 'file:') return false
  const folder = pathToFileURL(dirname(target.path) + '/').href
  return url.href.startsWith(folder)
}

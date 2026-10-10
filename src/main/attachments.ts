import { constants, mkdirSync } from 'fs'
import { copyFile, mkdir, readdir, rm, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'path'
import { ATTACHMENT_LIMITS } from '../shared/ipc'
import { CACHE_DIR } from './paths'

/** Pasta dos anexos: uma subpasta por conversa, com o session_id do Claude Code. */
export const ATTACHMENTS_DIR = join(CACHE_DIR, 'anexos')

/**
 * Imagens coladas com Ctrl+V: viram arquivo aqui assim que são coladas e, no envio, são
 * copiadas para a pasta da conversa como qualquer anexo.
 */
const PASTED_DIR = join(ATTACHMENTS_DIR, 'colados')
const PASTED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/** Pastas de conversas mais antigas que isso são apagadas quando o app abre. */
const KEEP_DAYS = 7
/** Imagens coladas e nunca enviadas são apagadas depois disso. */
const KEEP_PASTED_DAYS = 1
const SESSION_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 120

/** Miniatura que as páginas mandam junto com um anexo: um data URL de imagem pequeno. */
const THUMBNAIL = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/
const MAX_THUMBNAIL = 100_000

export function isThumbnail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_THUMBNAIL && THUMBNAIL.test(value)
}

/**
 * Nome da cópia: o original sem caracteres de controle, quebras de linha Unicode, controles de
 * direção do texto e `<` `>`. Um arquivo baixado pode ter qualquer nome, e esses caracteres
 * poderiam quebrar o bloco <anexos> da mensagem.
 */
function safeName(name: string): string {
  const clean = name
    // Os caracteres de controle no padrão são de propósito: são eles que saem do nome.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>]/g, '_')
    .trim()
  if (!clean || clean === '.' || clean === '..') return 'anexo'
  if (clean.length <= MAX_NAME) return clean
  const ext = extname(clean).slice(0, 16)
  return clean.slice(0, MAX_NAME - ext.length) + ext
}

/**
 * Cria um arquivo em `dir` sem sobrescrever nada: "foto.png", "foto (2).png", "foto (3).png"…
 * `create` grava no caminho dado e falha com EEXIST se ele já existir.
 */
async function createUnique(
  dir: string,
  name: string,
  create: (target: string) => Promise<void>
): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let n = 1; ; n++) {
    const target = join(dir, n === 1 ? name : `${stem} (${n})${ext}`)
    try {
      await create(target)
      return target
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 1000) throw err
    }
  }
}

function copyUnique(source: string, dir: string, name: string): Promise<string> {
  return createUnique(dir, name, (target) => copyFile(source, target, constants.COPYFILE_EXCL))
}

function reason(err: unknown): string {
  switch ((err as NodeJS.ErrnoException).code) {
    case 'ENOENT':
      return 'o arquivo não existe mais'
    case 'EACCES':
    case 'EPERM':
      return 'sem permissão para ler'
    default:
      return (err as Error).message
  }
}

export interface CopiedAttachments {
  /** Caminhos das cópias, na ordem em que os arquivos vieram. */
  paths: string[]
  /** Um aviso para o chat por arquivo que ficou de fora. */
  problems: string[]
}

/**
 * Copia os arquivos anexados para ~/.cache/wisp/anexos/<session_id>/. Uma cópia, e não o
 * original, para a conversa continuar funcionando se o arquivo for movido ou apagado.
 */
export async function copyAttachments(
  sources: string[],
  sessionId: string
): Promise<CopiedAttachments> {
  const dir = join(ATTACHMENTS_DIR, sessionId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const { maxFiles, maxBytes } = ATTACHMENT_LIMITS
  const paths: string[] = []
  const problems: string[] = []

  for (const source of sources.slice(0, maxFiles)) {
    const name = safeName(basename(source))
    try {
      if (!isAbsolute(source)) throw new Error('caminho inválido')
      const info = await stat(source)
      if (!info.isFile()) {
        problems.push(`"${name}" não é um arquivo: pastas não podem ser anexadas.`)
      } else if (info.size > maxBytes) {
        problems.push(`"${name}" passa de ${maxBytes / 1024 / 1024} MB e ficou de fora.`)
      } else {
        paths.push(await copyUnique(source, dir, name))
        // Uma imagem colada já tem a cópia dela na conversa; o arquivo de espera sai.
        if (dirname(source) === PASTED_DIR) await unlink(source).catch(() => {})
      }
    } catch (err) {
      problems.push(`Não consegui anexar "${name}": ${reason(err)}.`)
    }
  }
  if (sources.length > maxFiles) {
    problems.push(`Só os ${maxFiles} primeiros anexos foram enviados.`)
  }
  return { paths, problems }
}

/** "2026-10-10-143201": data e hora para o nome de uma imagem colada. */
function stamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  )
}

/**
 * Guarda uma imagem colada (Ctrl+V) num arquivo, para ela poder ser anexada como as outras.
 * Devolve o caminho e o nome, ou lança um erro com a explicação em português.
 */
export async function savePasted(
  data: Uint8Array,
  type: string,
  now = new Date()
): Promise<{ path: string; name: string }> {
  const ext = PASTED_TYPES[type]
  if (!ext) throw new Error('só dá para colar imagens PNG, JPEG, GIF ou WebP')
  if (data.byteLength > ATTACHMENT_LIMITS.maxBytes) {
    throw new Error(`a imagem passa de ${ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB`)
  }
  await mkdir(PASTED_DIR, { recursive: true, mode: 0o700 })
  const path = await createUnique(PASTED_DIR, `imagem-colada-${stamp(now)}.${ext}`, (target) =>
    writeFile(target, data, { flag: 'wx', mode: 0o600 })
  )
  return { path, name: basename(path) }
}

/** Cria a pasta dos anexos (o processo do Claude Code a recebe com --add-dir). */
export function ensureAttachmentsDir(): void {
  try {
    mkdirSync(ATTACHMENTS_DIR, { recursive: true, mode: 0o700 })
  } catch {
    // Sem ela, só os anexos deixam de funcionar, e o erro aparece ao anexar.
  }
}

/** Acrescenta à mensagem o bloco com os caminhos dos anexos, que o Claude lê com o Read. */
export function withAttachments(text: string, paths: string[]): string {
  if (!paths.length) return text
  const list = paths.map((path) => `- ${path}`).join('\n')
  return [text.trim(), `<anexos>\n${list}\n</anexos>`].filter(Boolean).join('\n\n')
}

/** Apaga o que em `dir` passou de `days` dias (e passa no `select`), sem reclamar de nada. */
async function removeOlderThan(
  dir: string,
  days: number,
  now: number,
  select: (entry: { name: string; isDirectory(): boolean }) => boolean
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const limit = now - days * 24 * 60 * 60 * 1000
  await Promise.all(
    entries.filter(select).map(async (entry) => {
      const path = join(dir, entry.name)
      try {
        if ((await stat(path)).mtimeMs < limit) await rm(path, { recursive: true, force: true })
      } catch {
        // Some no meio do caminho ou sem permissão: fica para a próxima.
      }
    })
  )
}

/**
 * Apaga as pastas de conversas com mais de KEEP_DAYS dias e as imagens coladas que nunca foram
 * enviadas, para o cache não crescer para sempre.
 */
export async function cleanOldAttachments(now = Date.now()): Promise<void> {
  await Promise.all([
    removeOlderThan(
      ATTACHMENTS_DIR,
      KEEP_DAYS,
      now,
      (entry) => entry.isDirectory() && SESSION_DIR.test(entry.name)
    ),
    removeOlderThan(PASTED_DIR, KEEP_PASTED_DAYS, now, (entry) => !entry.isDirectory())
  ])
}

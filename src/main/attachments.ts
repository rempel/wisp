import { constants, mkdirSync } from 'fs'
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, extname, isAbsolute, join } from 'path'
import { ATTACHMENT_LIMITS } from '../shared/ipc'
import { CACHE_DIR } from './paths'

/** Pasta dos anexos: uma subpasta por conversa, com o session_id do Claude Code. */
export const ATTACHMENTS_DIR = join(CACHE_DIR, 'anexos')

/** Pastas de conversas mais antigas que isso são apagadas quando o app abre. */
const KEEP_DAYS = 7
const SESSION_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 120

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

/** Copia para `dir` sem sobrescrever nada: "foto.png", "foto (2).png", "foto (3).png"… */
async function copyUnique(source: string, dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let n = 1; ; n++) {
    const target = join(dir, n === 1 ? name : `${stem} (${n})${ext}`)
    try {
      await copyFile(source, target, constants.COPYFILE_EXCL)
      return target
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 1000) throw err
    }
  }
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

/** Apaga as pastas de conversas com mais de KEEP_DAYS dias, para o cache não crescer para sempre. */
export async function cleanOldAttachments(now = Date.now()): Promise<void> {
  let entries
  try {
    entries = await readdir(ATTACHMENTS_DIR, { withFileTypes: true })
  } catch {
    return
  }
  const limit = now - KEEP_DAYS * 24 * 60 * 60 * 1000
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && SESSION_DIR.test(entry.name))
      .map(async (entry) => {
        const dir = join(ATTACHMENTS_DIR, entry.name)
        try {
          if ((await stat(dir)).mtimeMs < limit) await rm(dir, { recursive: true, force: true })
        } catch {
          // Some no meio do caminho ou sem permissão: fica para a próxima.
        }
      })
  )
}

// O registro do Wisp em arquivo: o que ele escreve no terminal (console.log/warn/error) também vai
// para ~/.local/state/wisp/wisp.log, para dar para ver o que aconteceu depois, sem um terminal
// aberto. O arquivo tem no máximo 1 MB no total (o atual e um anterior, de 512 KB cada) e não leva
// comandos, URLs nem segredos: cada linha passa por redact() antes de ir para o disco. O terminal
// continua recebendo tudo, como antes.

import { closeSync, mkdirSync, openSync, renameSync, statSync, writeSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { formatWithOptions } from 'util'

export const LOG_DIR = join(
  process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
  'wisp'
)
export const LOG_PATH = join(LOG_DIR, 'wisp.log')

/** Cada arquivo (o atual e o anterior, wisp.log.1) tem no máximo isto: 1 MB no total. */
export const LOG_FILE_LIMIT = 512 * 1024
/** Uma entrada só não passa disto (uma pilha de erro enorme, uma linha inesperada do CLI). */
const ENTRY_LIMIT = 4000

/**
 * Tira de um texto o que não vai para o arquivo: URLs (menos file://, que é um caminho), comandos
 * (os campos "command" do stream-json, as mensagens "Command failed" e os argumentos de um
 * processo que falhou), chaves e tokens. A pasta pessoal vira "~".
 */
export function redact(text: string, home = homedir()): string {
  let out = text
    // http://, https://, ws://, ftp://… (file:// fica: é um caminho do disco).
    .replace(/\b(?!file:)[a-z][a-z0-9+.-]{1,15}:\/\/[^\s'"`<>)\]}]+/gi, '<url>')
    .replace(/\bwww\.[a-z0-9-]+\.[^\s'"`<>)\]}]+/gi, '<url>')
    // "command": "..." no JSON (uma ferramenta Bash, um hook) e campos parecidos.
    .replace(
      /("(?:command|cmd|url|uri|href|query|prompt)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
      '$1"<omitido>"'
    )
    // O erro de um processo: "Command failed: git push …", e os campos do util.inspect.
    .replace(/(Command failed:)[^\n]*/g, '$1 <comando>')
    .replace(/(\bcmd:\s*)(['"`])(?:(?!\2)[^\\]|\\.)*\2/g, '$1$2<comando>$2')
    .replace(/(\bspawnargs:\s*)\[[^\]]*\]/g, '$1[<omitidos>]')
    // Chaves e tokens: sk-…, "Bearer …", "token=…", e hexadecimais longos (o token do MCP).
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '<segredo>')
    .replace(
      /\b(Bearer|token|authorization)(\s*[:=]?\s*)[A-Za-z0-9._~+/-]{16,}=*/gi,
      '$1$2<segredo>'
    )
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '<segredo>')
  if (home && home !== '/') out = out.split(`${home}/`).join('~/')
  return out
}

/** Uma linha do arquivo: a hora, o nível e a mensagem já limpa (no máximo ENTRY_LIMIT). */
export function logEntry(level: string, args: unknown[], now = new Date()): string {
  let message = redact(formatWithOptions({ colors: false, depth: 4 }, ...args))
  if (message.length > ENTRY_LIMIT) message = `${message.slice(0, ENTRY_LIMIT)}… (cortado)`
  return `${now.toISOString()} ${level.toUpperCase().padEnd(5)} ${message}\n`
}

/**
 * Um arquivo de registro que gira: passando do limite, o atual vira wisp.log.1 (o anterior a
 * ele some) e um novo começa. Um erro de disco desliga o arquivo, sem derrubar nada.
 */
export class RotatingLog {
  private fd: number | null = null
  private size = 0
  private broken = false

  constructor(
    readonly path: string,
    readonly limit = LOG_FILE_LIMIT
  ) {}

  write(entry: string): void {
    if (this.broken) return
    try {
      const bytes = Buffer.byteLength(entry)
      if (this.fd === null) this.open()
      if (this.size > 0 && this.size + bytes > this.limit) this.rotate()
      writeSync(this.fd as number, entry)
      this.size += bytes
    } catch {
      // Sem disco ou sem permissão: o terminal continua com tudo; o arquivo para.
      this.broken = true
      this.close()
    }
  }

  close(): void {
    if (this.fd === null) return
    try {
      closeSync(this.fd)
    } catch {
      // já fechado
    }
    this.fd = null
  }

  private open(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    this.fd = openSync(this.path, 'a', 0o600)
    this.size = statSync(this.path).size
  }

  private rotate(): void {
    this.close()
    renameSync(this.path, `${this.path}.1`)
    this.open()
  }
}

let installed: RotatingLog | null = null

/**
 * Passa a copiar o console para o arquivo. Chamado uma vez, no começo do processo principal; a
 * primeira linha diz qual Wisp é e como foi instalado.
 */
export function installLog(header: string, path = LOG_PATH): void {
  if (installed) return
  const file = new RotatingLog(path)
  installed = file
  const levels = { log: 'info', info: 'info', warn: 'warn', error: 'error' } as const
  for (const [method, level] of Object.entries(levels) as [keyof typeof levels, string][]) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      original(...args)
      file.write(logEntry(level, args))
    }
  }
  file.write(logEntry('info', [`--- ${header} ---`]))
  process.on('exit', () => file.close())
}

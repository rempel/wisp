// Subir o projeto com um clique (Fase 75): os servidores de uma pasta de projeto, lidos do
// `.claude/launch.json` (o arquivo que o Claude Code Desktop usa: o nome, o programa, os
// argumentos e a porta) ou, sem ele, dos scripts do package.json (dev, start, serve). O Wisp
// mostra o comando inteiro antes de rodar; rodar é colar o comando num terminal seu da bancada
// e, com a porta conhecida, abrir a página quando ela responde. Um comando lido de uma pasta
// nunca roda sozinho.

import { existsSync, readFileSync } from 'fs'
import { connect } from 'net'
import { join } from 'path'
import { usableFolder } from './folders'
import { expandHome } from './paths'
import type { LaunchConfig } from '../shared/ipc'

/** Quantos servidores a bancada mostra de uma pasta. */
const MAX_CONFIGS = 8
/** Um argumento que vai sem aspas: nada que o shell interprete. */
const PLAIN = /^[\w@%+=:,./-]+$/

/**
 * O comando numa linha, como o terminal vai receber. Um argumento com espaço vai entre aspas
 * simples (que o sh e o PowerShell leem igual); um com aspa simples, quebra de linha ou outro
 * controle é recusado: null.
 */
export function commandLine(executable: string, args: string[]): string | null {
  const parts: string[] = []
  for (const part of [executable, ...args]) {
    if (!part || part.includes("'") || [...part].some((char) => char.charCodeAt(0) < 32))
      return null
    parts.push(PLAIN.test(part) ? part : `'${part}'`)
  }
  const line = parts.join(' ')
  return line.length <= 500 ? line : null
}

const validPort = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535
    ? value
    : null

/** O `.claude/launch.json`, só com o que dá para rodar com segurança. */
export function parseLaunchJson(text: string): LaunchConfig[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const list = (parsed as { configurations?: unknown } | null)?.configurations
  if (!Array.isArray(list)) return []
  const out: LaunchConfig[] = []
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.runtimeExecutable !== 'string') continue
    const args = Array.isArray(item.runtimeArgs)
      ? item.runtimeArgs.filter((arg): arg is string => typeof arg === 'string')
      : []
    const command = commandLine(item.runtimeExecutable, args)
    if (!command) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : command
    out.push({
      name: name.slice(0, 60),
      command,
      port: validPort(item.port),
      source: 'launch.json'
    })
  }
  return out
}

/** O gerenciador de pacotes da pasta, pelo arquivo de trava dela. */
export function packageRunner(folder: string, exists = existsSync): string {
  if (exists(join(folder, 'pnpm-lock.yaml'))) return 'pnpm'
  if (exists(join(folder, 'yarn.lock'))) return 'yarn'
  if (exists(join(folder, 'bun.lockb')) || exists(join(folder, 'bun.lock'))) return 'bun'
  return 'npm'
}

/** Os scripts do package.json que sobem o projeto: dev, start e serve, nessa ordem. */
export function parsePackageJson(text: string, runner: string): LaunchConfig[] {
  let scripts: unknown
  try {
    scripts = (JSON.parse(text) as { scripts?: unknown } | null)?.scripts
  } catch {
    return []
  }
  if (!scripts || typeof scripts !== 'object') return []
  return ['dev', 'start', 'serve']
    .filter((name) => typeof (scripts as Record<string, unknown>)[name] === 'string')
    .map((name) => ({
      name,
      command: `${runner} run ${name}`,
      port: null,
      source: 'package.json' as const
    }))
}

const read = (path: string): string | null => {
  try {
    const text = readFileSync(path, 'utf8')
    return text.length <= 200_000 ? text : null
  } catch {
    return null
  }
}

/** Os servidores de uma pasta: os do launch.json; sem ele, os do package.json. */
export function launchConfigs(folder: string | null): LaunchConfig[] {
  const root = folder ? usableFolder(expandHome(folder)) : null
  if (!root) return []
  const launch = read(join(root, '.claude', 'launch.json'))
  const fromLaunch = launch ? parseLaunchJson(launch) : []
  if (fromLaunch.length) return fromLaunch.slice(0, MAX_CONFIGS)
  const pkg = read(join(root, 'package.json'))
  return pkg ? parsePackageJson(pkg, packageRunner(root)).slice(0, MAX_CONFIGS) : []
}

/** A porta responde nesta máquina? */
const listening = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    const done = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(800, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })

/** Espera a porta responder (o servidor acabou de subir), até `ms`. */
export async function waitForPort(port: number, ms = 90_000, every = 500): Promise<boolean> {
  const start = Date.now()
  for (;;) {
    if (await listening(port)) return true
    if (Date.now() - start >= ms) return false
    await new Promise((resolve) => setTimeout(resolve, every))
  }
}

// Rodar programas no Windows (Fase 33) sem passar por um shell, como no Linux: o `claude.exe` do
// instalador oficial roda direto; o `claude.cmd` que o npm instala é só um atalho para o Node com
// o `cli.js`, e o Wisp roda o Node com o `cli.js` direto (um .cmd só roda dentro do cmd.exe, e
// passar argumentos por ele é passar uma string a um shell). Também: o PATH, que no Windows se
// chama Path, e encerrar uma árvore de processos, que no Windows não tem grupo de processos.

import { spawn } from 'child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, extname, join } from 'path'

/** As extensões que um programa sem extensão pode ter, na ordem do PATHEXT de sempre. */
export const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat']

/** O nome da variável do PATH num ambiente (no Windows ela costuma se chamar Path). */
export function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

/** As pastas do PATH de um ambiente. */
export function pathDirs(env: NodeJS.ProcessEnv): string[] {
  return (env[pathKey(env)] ?? '').split(delimiter).filter(Boolean)
}

/** Onde o instalador do Claude Code e os gerenciadores de Node deixam o `claude` no Windows. */
export function windowsInstallDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = homedir()
  const roaming = env.APPDATA || join(home, 'AppData', 'Roaming')
  const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  return [
    // O instalador oficial (irm https://claude.ai/install.ps1 | iex).
    join(home, '.local', 'bin'),
    join(roaming, 'npm'),
    join(local, 'Volta', 'bin'),
    join(local, 'pnpm'),
    join(home, '.bun', 'bin'),
    join(home, 'scoop', 'shims'),
    join(local, 'Microsoft', 'WinGet', 'Links')
  ]
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * O programa no Windows: um caminho (com ou sem extensão) ou um nome procurado nas pastas. Um
 * nome simples só vale com extensão (.exe, .cmd, .bat): o `claude` sem extensão que o npm também
 * instala é um script do sh, para o Git Bash.
 */
export function resolveWindows(command: string, dirs: string[]): string | null {
  const hasExtension = extname(command) !== ''
  const withExtensions = (base: string): string[] =>
    hasExtension ? [base] : WINDOWS_EXTENSIONS.map((ext) => base + ext)
  if (/[\\/]/.test(command)) {
    return [...withExtensions(command), command].find(isFile) ?? null
  }
  for (const dir of dirs) {
    const found = withExtensions(join(dir, command)).find(isFile)
    if (found) return found
  }
  return null
}

/** O script que um atalho .cmd do npm (ou do pnpm) roda com o Node; null se não for um. */
export function npmShimTarget(shim: string, text: string): string | null {
  const match = /"%~?dp0%?\\?([^"%]+?\.[cm]?js)"/i.exec(text)
  // O atalho usa a barra do Windows; o caminho é montado por partes.
  return match ? join(dirname(shim), ...match[1].split(/[\\/]/)) : null
}

/** O começo de um arquivo (para ver se é um script do Node). */
function head(path: string): string {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buffer = Buffer.alloc(256)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, read).toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/** Um script do Node: .js, .mjs ou .cjs, ou um arquivo que começa com `#!...node`. */
function isNodeScript(path: string): boolean {
  if (/\.[cm]?js$/i.test(path)) return true
  return /^#!.*\bnode\b/.test(head(path).split('\n')[0] ?? '')
}

/** O node.exe: ao lado do atalho do npm ou no PATH. */
function findNode(beside: string, env: NodeJS.ProcessEnv): string | null {
  return [beside, ...pathDirs(env)].map((dir) => join(dir, 'node.exe')).find(isFile) ?? null
}

export interface WindowsLaunch {
  command: string
  args: string[]
  /** Variáveis a mais (o Electron do Wisp fazendo as vezes do Node). */
  env?: Record<string, string>
}

/**
 * Como rodar `bin` com `args` no Windows, sem shell: um .exe direto; um atalho .cmd do npm ou um
 * script do Node pelo node.exe (sem um, pelo próprio Electron do Wisp, como Node). Outra coisa vai
 * como está (e o erro de não conseguir rodar aparece na conversa).
 */
export function windowsLaunch(bin: string, args: string[], env: NodeJS.ProcessEnv): WindowsLaunch {
  const ext = extname(bin).toLowerCase()
  if (ext === '.exe' || ext === '.com') return { command: bin, args }
  let script: string | null = null
  if (ext === '.cmd' || ext === '.bat') {
    try {
      script = npmShimTarget(bin, readFileSync(bin, 'utf8'))
    } catch {
      script = null
    }
    if (script && !existsSync(script)) script = null
  } else if (isNodeScript(bin)) {
    script = bin
  }
  if (!script) return { command: bin, args }
  const node = findNode(dirname(bin), env)
  if (node) return { command: node, args: [script, ...args] }
  return { command: process.execPath, args: [script, ...args], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

/** O taskkill do Windows, pelo caminho do sistema (nunca um achado no PATH). */
function taskkill(): string {
  return join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
}

/**
 * Encerra um processo e os filhos dele (o Claude Code roda o Bash, o Node, o MCP...). No Windows
 * não há grupo de processos: o taskkill /T percorre a árvore.
 */
export function killTree(pid: number): void {
  try {
    spawn(taskkill(), ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    }).on('error', () => {})
  } catch {
    // Já saiu.
  }
}

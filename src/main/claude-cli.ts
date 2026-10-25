// Onde está o Claude Code, com que ambiente ele roda e se está logado: a checagem antes da
// primeira mensagem e o que o diagnóstico (Fase 20) mostra.

import { spawn } from 'child_process'
import { accessSync, constants, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, join } from 'path'
import { INTERNAL_ENV } from './hooks/protocol'
import { hostProgramDirs, viaHost } from './host'
import type { HostCommand } from './host'
import { expandHome } from './paths'
import { t } from '../shared/i18n'

/** Como ver o Wisp funcionando antes de instalar o Claude Code ou de fazer login. */
const DEMO_HINT =
  t(
    'Para ver o Wisp funcionando antes, ligue o **Modo demonstração** no menu do mascote (clique '
  ) + t('com o botão direito nele).')

export const LOGIN_HINT =
  t('Rode `claude` no terminal e faça login. Depois é só mandar a mensagem de novo. ') + DEMO_HINT
export const INSTALL_HINT =
  t('Não encontrei o Claude Code (`claude`). Instale-o, rode `claude` no terminal para fazer ') +
  t('login e depois mande a mensagem de novo. Se ele estiver num lugar fora do PATH, informe o ') +
  t('caminho em `claudePath` no `~/.config/wisp/config.json`. ') +
  DEMO_HINT

const AUTH_TIMEOUT_MS = 15000

/**
 * Acha o executável do CLI. Um nome simples é procurado no PATH e nas pastas onde os
 * instaladores do Claude Code o colocam, porque quando o app é aberto pelo menu do sistema o
 * PATH pode não incluí-las.
 */
export function resolveCommand(command: string): string | null {
  const candidates = command.includes('/')
    ? [expandHome(command)]
    : [...(process.env.PATH ?? '').split(delimiter), ...installDirs(), ...hostProgramDirs()]
        .filter(Boolean)
        .map((dir) => join(dir, command))
  return candidates.find(isExecutableFile) ?? null
}

/**
 * Onde o instalador do Claude Code e os gerenciadores de Node deixam o `claude`. Um app aberto
 * pelo menu do sistema ou no login recebe um PATH curto, sem essas pastas.
 */
function installDirs(): string[] {
  const home = homedir()
  return [
    join(home, '.local/bin'),
    join(home, '.claude/local'),
    join(home, '.npm-global/bin'),
    join(home, '.volta/bin'),
    join(home, '.bun/bin'),
    join(home, '.local/share/pnpm'),
    join(home, '.yarn/bin'),
    join(home, '.asdf/shims'),
    join(home, '.local/share/mise/shims'),
    ...nodeVersionDirs(join(home, '.nvm/versions/node'), 'bin'),
    ...nodeVersionDirs(join(home, '.local/share/fnm/node-versions'), 'installation/bin')
  ]
}

/** A pasta bin de cada versão do Node instalada (nvm, fnm), da mais nova para a mais velha. */
function nodeVersionDirs(root: string, bin: string): string[] {
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const parts = (name: string): number[] => name.replace(/^v/, '').split('.').map(Number)
  const newerFirst = (a: string, b: string): number => {
    const [x, y] = [parts(a), parts(b)]
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
  }
  return names
    .filter((name) => /^v?\d+\.\d+\.\d+$/.test(name))
    .sort(newerFirst)
    .map((name) => join(root, name, bin))
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Ambiente do CLI: o do app, com alguns ajustes.
 * - Sem ANTHROPIC_API_KEY nem ANTHROPIC_AUTH_TOKEN: com uma delas definida, o Claude Code cobra o
 *   uso pela API em vez de usar a assinatura. (Pela OpenRouter, a escolha é da pessoa: o token
 *   dela entra depois, em openrouterEnv.)
 * - Sem a memória automática do Claude Code: ela grava arquivos em ~/.claude/projects/…/memory
 *   sem passar pelo card de permissão e os carrega em toda conversa, o que deixaria um texto
 *   malicioso (lido pelo WebFetch, por exemplo) plantar instruções que ficam para sempre.
 * - Sem as variáveis do npm e do Electron (CHROME_DESKTOP, ELECTRON_*): o que o CLI abre as
 *   herdaria. O navegador do Claude, por exemplo, se apresentaria como o Wisp na barra de
 *   tarefas.
 */
export function claudeEnv(bin: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_') || key.startsWith('ELECTRON_') || key === 'CHROME_DESKTOP') {
      delete env[key]
    }
  }
  delete env.ANTHROPIC_API_KEY
  // Um token herdado passaria na frente do login da assinatura do mesmo jeito.
  delete env.ANTHROPIC_AUTH_TOKEN
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  // Marca os processos do Wisp: os hooks deles não viram sessões na aba Sessões.
  env[INTERNAL_ENV] = '1'
  // O `claude` instalado pelo npm é um script `#!/usr/bin/env node`: a pasta dele (onde, no nvm,
  // fica o node da mesma versão) vai na frente do PATH.
  const dir = dirname(bin)
  const path = (env.PATH ?? '').split(delimiter).filter(Boolean)
  if (!path.includes(dir)) env.PATH = [dir, ...path].join(delimiter)
  return env
}

/** As variáveis que o Claude Code nunca recebe do Wisp (a chave passaria na frente da assinatura). */
const NEVER_PASS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']

/** O comando que roda o Claude Code (no Flatpak, pelo flatpak-spawn --host). */
export function claudeCommand(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd?: string
): HostCommand {
  return viaHost(bin, args, { env, cwd, unset: NEVER_PASS })
}

type CheckResult = { ok: true; bin: string } | { ok: false; hint: string }

/** Confere se o CLI existe e está logado, com `claude auth status`. */
export async function checkClaude(command: string): Promise<CheckResult> {
  const bin = resolveCommand(command)
  if (!bin) return { ok: false, hint: INSTALL_HINT }

  const status = await new Promise<{ code: number | null; stdout: string; failed: boolean }>(
    (resolve) => {
      const env = claudeEnv(bin)
      const run = claudeCommand(bin, ['auth', 'status', '--json'], env)
      const child = spawn(run.command, run.args, {
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: AUTH_TIMEOUT_MS
      })
      let stdout = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => (stdout += chunk))
      child.on('error', () => resolve({ code: null, stdout, failed: true }))
      child.on('close', (code) => resolve({ code, stdout, failed: false }))
    }
  )
  if (status.failed) return { ok: false, hint: INSTALL_HINT }

  try {
    const { loggedIn } = JSON.parse(status.stdout) as { loggedIn?: unknown }
    if (loggedIn === false) return { ok: false, hint: LOGIN_HINT }
  } catch {
    // Saída inesperada (versão antiga, timeout): segue em frente. Se faltar login, o próprio
    // stream acusa e o aviso aparece do mesmo jeito.
  }
  return { ok: true, bin }
}

/** O que o diagnóstico precisa saber do Claude Code (Fase 20). */
export interface ClaudeStatus {
  installed: boolean
  /** A versão ("2.1.296"); null se não deu para saber. */
  version: string | null
  /** Logado na assinatura; null se não deu para saber. */
  loggedIn: boolean | null
}

/** Roda o CLI com uns argumentos e devolve a saída (null se não rodou ou demorou). */
function runClaude(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const env = claudeEnv(bin)
    const run = claudeCommand(bin, args, env)
    const child = spawn(run.command, run.args, {
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: AUTH_TIMEOUT_MS
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 || stdout ? stdout : null))
  })
}

/** O Claude Code instalado, a versão e o login, para o diagnóstico. */
export async function claudeStatus(command: string): Promise<ClaudeStatus> {
  const bin = resolveCommand(command)
  if (!bin) return { installed: false, version: null, loggedIn: null }
  const [version, auth] = await Promise.all([
    runClaude(bin, ['--version']),
    runClaude(bin, ['auth', 'status', '--json'])
  ])
  let loggedIn: boolean | null = null
  try {
    const parsed = JSON.parse(auth ?? '') as { loggedIn?: unknown }
    if (typeof parsed.loggedIn === 'boolean') loggedIn = parsed.loggedIn
  } catch {
    // Versão antiga ou saída inesperada: não dá para saber.
  }
  return { installed: true, version: /\d+\.\d+\.\d+/.exec(version ?? '')?.[0] ?? null, loggedIn }
}

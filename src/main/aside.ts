// A pergunta lateral (Fase 46): uma dúvida rápida com o contexto da conversa, sem entrar nela. Um
// Claude Code à parte retoma a sessão numa cópia que não é gravada (--fork-session com
// --no-session-persistence), sem ferramentas e com um turno só, e a resposta vai só para a
// caixinha do painel. A conversa segue como estava, mesmo com o Claude trabalhando nela.

import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { claudeCommand } from './claude-cli'
import type { AsideResult } from '../shared/ipc'
import { t } from '../shared/i18n'

/** O que subir o Claude Code da pergunta precisa (vem da sessão da conversa). */
export interface AsideLaunch {
  bin: string
  env: NodeJS.ProcessEnv
  cwd: string
  /** A sessão para retomar numa cópia; null antes da primeira resposta (a pergunta vai sozinha). */
  sessionId: string | null
  model: string | null
}

/** As ferramentas que ficam de fora: a pergunta só responde, não mexe em nada nem lê. */
export const ASIDE_DENIED = [
  'Bash',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'TodoWrite'
]
/** O tamanho máximo da pergunta. */
export const MAX_ASIDE = 4000
const TIMEOUT_MS = 120_000

const ASIDE_PROMPT =
  'This is a side question about the conversation so far. Answer briefly, from what you already ' +
  'know; do not use tools and do not continue the task.'

/** Os argumentos do Claude Code da pergunta (a pergunta vai pela entrada, não pela linha). */
export function asideArgs(launch: AsideLaunch): string[] {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--no-session-persistence',
    '--max-turns',
    '1',
    '--disallowedTools',
    ASIDE_DENIED.join(','),
    '--strict-mcp-config',
    '--append-system-prompt',
    ASIDE_PROMPT
  ]
  if (launch.model) args.push(`--model=${launch.model}`)
  if (launch.sessionId) args.push('--resume', launch.sessionId, '--fork-session')
  return args
}

/** A resposta no que o `--output-format json` escreve (a última linha que é um resultado). */
export function parseAside(stdout: string): AsideResult | null {
  const lines = stdout.trim().split('\n').reverse()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type?: unknown; result?: unknown; is_error?: unknown }
      if (parsed.type !== 'result') continue
      const text = typeof parsed.result === 'string' ? parsed.result.trim() : ''
      if (parsed.is_error === true || !text) {
        return { ok: false, text: text || t('O Claude não respondeu à pergunta.') }
      }
      return { ok: true, text }
    } catch {
      // Uma linha que não é JSON (um aviso): a próxima.
    }
  }
  return null
}

/** Faz a pergunta e espera a resposta (até 2 minutos). */
export function askAside(launch: AsideLaunch, question: string): Promise<AsideResult> {
  const text = question.trim().slice(0, MAX_ASIDE)
  if (!text) return Promise.resolve({ ok: false, text: t('Escreva a pergunta.') })
  const env = { ...launch.env }
  const run = claudeCommand(launch.bin, asideArgs(launch), env, launch.cwd)
  return new Promise((resolve) => {
    let proc: ChildProcess
    try {
      proc = spawn(run.command, run.args, { cwd: launch.cwd, env, windowsHide: true })
    } catch (err) {
      resolve({ ok: false, text: (err as Error).message })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS)
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => (stdout += chunk))
    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-2000)))
    proc.stdin?.on('error', () => {})
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, text: err.message })
    })
    proc.on('close', () => {
      clearTimeout(timer)
      resolve(
        parseAside(stdout) ?? {
          ok: false,
          text: stderr.trim().split('\n').at(-1) || t('O Claude não respondeu à pergunta.')
        }
      )
    })
    proc.stdin?.end(text)
  })
}

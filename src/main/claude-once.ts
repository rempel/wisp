// Um Claude Code de uma vez só (Fase 81): -p com uma pergunta pela entrada e uma resposta em JSON,
// sem ferramentas, sem os servidores MCP e sem gravar sessão. É o que a destilação e a faxina da
// memória usam, com o Haiku. O custo da resposta (o total_cost_usd do resultado) volta junto.

import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { ASIDE_DENIED } from './aside'
import { claudeCommand, claudeEnv, resolveCommand } from './claude-cli'

export interface OnceResult {
  ok: boolean
  text: string
  /** Em dólares, como o Claude Code informa (0 se não informou). */
  cost: number
}

export interface OnceRequest {
  claudePath: string
  cwd: string
  prompt: string
  system: string
  model?: string
  timeoutMs?: number
}

/** O resultado no que o `--output-format json` escreve. */
export function parseOnce(stdout: string): OnceResult | null {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      const parsed = JSON.parse(line) as {
        type?: unknown
        result?: unknown
        is_error?: unknown
        total_cost_usd?: unknown
      }
      if (parsed.type !== 'result') continue
      const text = typeof parsed.result === 'string' ? parsed.result.trim() : ''
      const cost = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : 0
      return { ok: parsed.is_error !== true && !!text, text, cost }
    } catch {
      // Um aviso, não JSON: a próxima linha.
    }
  }
  return null
}

/** Pergunta uma vez e espera a resposta (até 3 minutos, por padrão). */
export function askOnce(request: OnceRequest): Promise<OnceResult> {
  const bin = resolveCommand(request.claudePath)
  if (!bin) return Promise.resolve({ ok: false, text: 'Claude Code não encontrado', cost: 0 })
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
    request.system,
    `--model=${request.model ?? 'haiku'}`
  ]
  const env = claudeEnv(bin)
  const run = claudeCommand(bin, args, env, request.cwd)
  return new Promise((resolve) => {
    let proc: ChildProcess
    try {
      proc = spawn(run.command, run.args, { cwd: request.cwd, env, windowsHide: true })
    } catch (err) {
      resolve({ ok: false, text: (err as Error).message, cost: 0 })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => proc.kill(), request.timeoutMs ?? 180_000)
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => (stdout += chunk))
    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-2000)))
    proc.stdin?.on('error', () => {})
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, text: err.message, cost: 0 })
    })
    proc.on('close', () => {
      clearTimeout(timer)
      resolve(
        parseOnce(stdout) ?? {
          ok: false,
          text: stderr.trim().split('\n').at(-1) || 'sem resposta',
          cost: 0
        }
      )
    })
    proc.stdin?.end(request.prompt)
  })
}

/** O primeiro objeto JSON de um texto (a resposta pode vir num bloco ```json). */
export function jsonOf(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

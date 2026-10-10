// Contrato entre o relay (`wisp-hook`, que o Claude Code roda a cada hook) e o app. Este
// arquivo também entra no bundle do relay: só Node, nada do Electron.

import { lstatSync } from 'fs'
import { isAbsolute, join } from 'path'
import type { FileDiff } from '../../shared/ipc'

/** Nome do relay. Aparece no caminho do comando e marca as entradas do Wisp no settings.json. */
export const RELAY_NAME = 'wisp-hook'

/** Variável que marca os processos do próprio Wisp: os hooks deles não viram sessões. */
export const INTERNAL_ENV = 'WISP_INTERNAL'

/** Quanto o Claude Code espera uma decisão de permissão antes de desistir do relay (s). */
export const DECISION_TIMEOUT_S = 300

/**
 * Os eventos que o Wisp escuta. Só o pedido de permissão faz o Claude Code esperar o relay; os
 * outros rodam em segundo plano (`async`) e nunca atrasam a sessão.
 */
export const HOOK_EVENTS: readonly { event: string; timeout: number; async: boolean }[] = [
  { event: 'SessionStart', timeout: 10, async: true },
  { event: 'UserPromptSubmit', timeout: 10, async: true },
  { event: 'PreToolUse', timeout: 10, async: true },
  { event: 'PostToolUse', timeout: 10, async: true },
  { event: 'PostToolUseFailure', timeout: 10, async: true },
  { event: 'PermissionRequest', timeout: DECISION_TIMEOUT_S, async: false },
  { event: 'Stop', timeout: 10, async: true },
  { event: 'StopFailure', timeout: 10, async: true },
  { event: 'SessionEnd', timeout: 10, async: true }
]

/**
 * Variáveis do terminal que o relay repassa: dizem em que terminal a sessão roda, para o Wisp
 * achar a janela dela.
 */
export const TERMINAL_ENV = [
  'TERM_PROGRAM',
  'WINDOWID',
  'TMUX',
  'TMUX_PANE',
  'KONSOLE_DBUS_SERVICE',
  'KONSOLE_DBUS_WINDOW',
  'GNOME_TERMINAL_SCREEN',
  'KITTY_WINDOW_ID',
  'WEZTERM_PANE',
  'CLAUDE_CODE_ENTRYPOINT'
] as const

/** Do relay para o app: um evento de hook, numa linha de JSON. */
export interface RelayEvent {
  v: 1
  /** Nome do evento ("PreToolUse"…). */
  event: string
  /**
   * Quando o relay começou (ms Unix). Os hooks em segundo plano podem chegar fora de ordem; esta
   * hora, que é a do disparo, põe a ordem de volta.
   */
  at: number
  /** O processo do Claude Code (o pai do relay). */
  pid: number
  /** As variáveis de TERMINAL_ENV que estavam definidas. */
  env: Record<string, string>
  /** A entrada do hook, sem os campos grandes. */
  input: Record<string, unknown>
  /** O diff de uma edição (PostToolUse de Edit, Write…), já calculado pelo relay. */
  diff?: FileDiff
  /**
   * Hash da entrada inteira da ferramenta (antes dos cortes). Liga o pedido de permissão ao
   * resultado da mesma chamada, que chega se o pedido foi respondido no terminal.
   */
  inputHash?: string
}

/**
 * Do app para o relay, só no pedido de permissão. Sem decisão (`null`), o relay não imprime
 * nada e quem decide é o diálogo do próprio terminal.
 */
export type RelayReply =
  | { decision: 'allow' }
  | { decision: 'deny'; message: string }
  /** Respostas a uma pergunta (AskUserQuestion): texto da pergunta → resposta. */
  | { decision: 'answer'; answers: Record<string, string> }
  | { decision: null }

/** Onde fica o socket: $XDG_RUNTIME_DIR/wisp, ou /run/user/<uid>/wisp sem a variável. */
export function socketDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_RUNTIME_DIR
  const base = xdg && isAbsolute(xdg) ? xdg : `/run/user/${process.getuid?.() ?? 0}`
  return join(base, 'wisp')
}

export function socketPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(socketDir(env), 'hooks.sock')
}

/**
 * Uma pasta de verdade (não um link), do usuário e fechada para os outros. Só nela o socket é
 * confiável: ninguém mais consegue criar nem abrir nada lá dentro.
 */
export function isPrivateDir(dir: string): boolean {
  try {
    const info = lstatSync(dir)
    return info.isDirectory() && info.uid === process.getuid?.() && (info.mode & 0o077) === 0
  } catch {
    return false
  }
}

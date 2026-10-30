import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { activateXWindow, listXWindows, XClient } from './ewmh'
import { isKde, kwinActivatePids } from './kwin'
import { viaHost } from './host'
import { IS_WINDOWS } from './platform'
import { focusWindowsProcess } from './windows-win'
import { t } from '../shared/i18n'

/** O que se sabe de onde uma sessão roda. */
export interface TerminalTarget {
  /** O processo do Claude Code. */
  pid: number | null
  /** Variáveis do terminal que o relay repassou (WINDOWID, TMUX…). */
  env: Record<string, string>
}

export interface FocusResult {
  ok: boolean
  message?: string
}

const TIMEOUT_MS = 3000

/** Roda um programa com argumentos (sem shell) e devolve a saída, ou null se falhar. */
function run(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const host = viaHost(command, args)
    execFile(host.command, host.args, { timeout: TIMEOUT_MS, windowsHide: true }, (error, stdout) =>
      resolve(error ? null : stdout)
    )
  })
}

/** O processo e os pais dele, até o init (pelo /proc). */
export function ancestors(pid: number): number[] {
  const chain: number[] = []
  let current: number | null = pid
  while (current && current > 1 && chain.length < 32 && !chain.includes(current)) {
    chain.push(current)
    try {
      const stat = readFileSync(`/proc/${current}/stat`, 'utf8')
      // O nome do comando vem entre parênteses e pode ter espaços: o pai vem depois do estado.
      current = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) || null
    } catch {
      break
    }
  }
  return chain
}

/**
 * Sessão no tmux: o terminal é o do cliente conectado, não um pai do Claude Code. Mostra o painel
 * da sessão no cliente e devolve os processos dos clientes.
 */
async function tmuxClients(env: Record<string, string>): Promise<number[]> {
  const socket = env.TMUX?.split(',')[0]
  if (!socket) return []
  const pane = env.TMUX_PANE
  if (pane && /^%\d+$/.test(pane)) {
    await run('tmux', ['-S', socket, 'select-window', '-t', pane])
    await run('tmux', ['-S', socket, 'select-pane', '-t', pane])
  }
  const out = await run('tmux', ['-S', socket, 'list-clients', '-F', '#{client_pid}'])
  return (out ?? '')
    .split('\n')
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 1)
}

/**
 * X11: pelo EWMH, a janela que o terminal anunciou (WINDOWID) ou a de um dos processos (na ordem
 * dada: o terminal costuma ser o primeiro pai com janela).
 */
async function focusWithEwmh(windowId: string | undefined, pids: number[]): Promise<boolean> {
  const client = await XClient.open()
  if (!client) return false
  try {
    const windows = (await listXWindows(client, process.pid)) ?? []
    const byId =
      windowId && /^\d+$/.test(windowId)
        ? windows.find((w) => w.id === Number(windowId))
        : undefined
    const target = byId ?? pids.map((pid) => windows.find((w) => w.pid === pid)).find(Boolean)
    return target ? await activateXWindow(client, target) : false
  } finally {
    client.close()
  }
}

/**
 * Traz para a frente o terminal onde a sessão roda. No KDE usa um script do KWin; no X11, o
 * EWMH. No GNOME com Wayland não há como (o chat oferece abrir a pasta no editor).
 */
export async function focusTerminal(target: TerminalTarget): Promise<FocusResult> {
  if (!target.pid) return { ok: false, message: t('Não sei em que terminal esta sessão roda.') }
  if (IS_WINDOWS) {
    // No Windows (Fase 36): pelos pais do Claude Code, até a janela do terminal.
    const result = await focusWindowsProcess(target.pid)
    if (result === 'ok') return { ok: true }
    return {
      ok: false,
      message:
        result === 'nao'
          ? t('O Windows não deixou trazer a janela do terminal para a frente.')
          : t('Não achei a janela do terminal.')
    }
  }
  const pids = ancestors(target.pid)
  for (const client of await tmuxClients(target.env)) pids.push(...ancestors(client))
  // O próprio Claude Code e o shell não têm janela; ficam no fim.
  const candidates = [...pids.slice(2), ...pids.slice(0, 2)]
  if (isKde() && (await kwinActivatePids(candidates))) return { ok: true }
  if (process.env.XDG_SESSION_TYPE !== 'wayland') {
    if (await focusWithEwmh(target.env.WINDOWID, candidates)) return { ok: true }
  }
  return {
    ok: false,
    message:
      process.env.XDG_SESSION_TYPE === 'wayland'
        ? t(
            'Nesta área de trabalho com Wayland, o Wisp não consegue trazer outra janela para a frente.'
          )
        : t('Não achei a janela do terminal.')
  }
}

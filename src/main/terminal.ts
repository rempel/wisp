import { execFile } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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
    execFile(command, args, { timeout: TIMEOUT_MS }, (error, stdout) =>
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
 * KDE (X11 ou Wayland): um script do KWin ativa a janela de um dos processos. É carregado pelo
 * D-Bus, roda uma vez e sai.
 */
async function focusWithKWin(pids: number[]): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-kwin-'))
  const file = join(dir, 'focus.js')
  // Os pids vão como números num JSON: nada do lado de fora entra no script como código.
  writeFileSync(
    file,
    [
      `const pids = ${JSON.stringify(pids.filter(Number.isInteger))};`,
      'const all = workspace.windowList ? workspace.windowList() : workspace.clientList();',
      'for (let i = 0; i < pids.length; i++) {',
      '  const found = all.filter((w) => w.pid === pids[i] && w.normalWindow);',
      '  if (found.length) {',
      '    if (workspace.windowList) workspace.activeWindow = found[0];',
      '    else workspace.activeClient = found[0];',
      '    break;',
      '  }',
      '}',
      ''
    ].join('\n')
  )
  const call = (path: string, method: string, ...args: string[]): Promise<string | null> =>
    run('dbus-send', ['--session', '--print-reply', '--dest=org.kde.KWin', path, method, ...args])
  try {
    await call('/Scripting', 'org.kde.kwin.Scripting.unloadScript', 'string:wisp-focus')
    const loaded = await call(
      '/Scripting',
      'org.kde.kwin.Scripting.loadScript',
      `string:${file}`,
      'string:wisp-focus'
    )
    const id = /int32 (-?\d+)/.exec(loaded ?? '')?.[1]
    if (!id || Number(id) < 0) return false
    // O caminho do script mudou entre versões do KWin.
    const ran =
      (await call(`/Scripting/Script${id}`, 'org.kde.kwin.Script.run')) ??
      (await call(`/${id}`, 'org.kde.kwin.Script.run'))
    return ran !== null
  } finally {
    setTimeout(() => {
      void call('/Scripting', 'org.kde.kwin.Scripting.unloadScript', 'string:wisp-focus')
      rmSync(dir, { recursive: true, force: true })
    }, 1000)
  }
}

/** X11 com xdotool: pela janela que o terminal anunciou (WINDOWID) ou pela dos processos. */
async function focusWithXdotool(windowId: string | undefined, pids: number[]): Promise<boolean> {
  if (!process.env.DISPLAY) return false
  if (windowId && /^\d+$/.test(windowId)) {
    if ((await run('xdotool', ['windowactivate', '--sync', windowId])) !== null) return true
  }
  for (const pid of pids) {
    const found = await run('xdotool', ['search', '--onlyvisible', '--pid', String(pid)])
    const window = found?.split('\n').find((line) => /^\d+$/.test(line.trim()))
    if (window && (await run('xdotool', ['windowactivate', '--sync', window.trim()])) !== null) {
      return true
    }
  }
  return false
}

/**
 * Traz para a frente o terminal onde a sessão roda. No KDE usa um script do KWin; no X11, o
 * xdotool. No GNOME com Wayland não há como (o chat oferece abrir a pasta no editor).
 */
export async function focusTerminal(target: TerminalTarget): Promise<FocusResult> {
  if (!target.pid) return { ok: false, message: 'Não sei em que terminal esta sessão roda.' }
  const pids = ancestors(target.pid)
  for (const client of await tmuxClients(target.env)) pids.push(...ancestors(client))
  // O próprio Claude Code e o shell não têm janela; ficam no fim.
  const candidates = [...pids.slice(2), ...pids.slice(0, 2)]
  if (process.env.XDG_CURRENT_DESKTOP?.toUpperCase().includes('KDE')) {
    if (await focusWithKWin(candidates)) return { ok: true }
  }
  if (await focusWithXdotool(target.env.WINDOWID, candidates)) return { ok: true }
  return {
    ok: false,
    message:
      process.env.XDG_SESSION_TYPE === 'wayland'
        ? 'Nesta área de trabalho com Wayland, o Wisp não consegue trazer outra janela para a frente.'
        : 'Não achei a janela do terminal (no X11, o Wisp usa o xdotool).'
  }
}

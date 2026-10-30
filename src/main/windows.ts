import { activateXWindow, listXWindows, XClient } from './ewmh'
import type { XWindow } from './ewmh'
import { isKde, kwinActivate, kwinWindows } from './kwin'
import { IS_WINDOWS } from './platform'
import { activateWindowsWindow, windowsWindows } from './windows-win'
import { t } from '../shared/i18n'

// As janelas dos outros apps: listar e trazer para a frente onde o desktop deixa. No KDE, por um
// script do KWin (X11 e Wayland); no X11, pelo EWMH; no Windows (Fase 35), pelas funções do
// próprio Windows. No GNOME com Wayland não há como.

/** Uma janela de app. */
export interface WindowInfo {
  /** "kwin:{uuid}", "x11:<número>" ou "win:<número>" (o HWND). */
  id: string
  app: string
  title: string
  minimized: boolean
  active: boolean
  pid?: number
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Por que não dá para ver as janelas aqui. */
function unsupported(env: NodeJS.ProcessEnv): string {
  if (env.XDG_SESSION_TYPE === 'wayland') {
    return (env.XDG_CURRENT_DESKTOP ?? '').toUpperCase().includes('GNOME')
      ? t('No GNOME com Wayland, o sistema não deixa um app ver nem trazer para a frente as ') +
          t('janelas dos outros.')
      : t('Nesta área de trabalho com Wayland, o Wisp não consegue ver as janelas dos outros ') +
          t('apps (funciona no KDE e no X11).')
  }
  return t('O gerenciador de janelas não informa as janelas abertas (EWMH).')
}

const fromX = (window: XWindow): WindowInfo => ({
  id: `x11:${window.id}`,
  app: window.app,
  title: window.title,
  minimized: window.minimized,
  active: window.active,
  ...(window.pid ? { pid: window.pid } : {})
})

/** As janelas abertas, da mais à frente para a mais atrás, sem as do próprio Wisp. */
export async function listWindows(
  env: NodeJS.ProcessEnv = process.env
): Promise<WindowInfo[] | { error: string }> {
  if (IS_WINDOWS) {
    const found = await windowsWindows(process.pid)
    if (!found) return { error: t('O Windows não respondeu com a lista de janelas.') }
    return found.map(({ id, pid, app, title, minimized, active }) => ({
      id: `win:${id}`,
      app: app ?? '',
      title,
      minimized,
      active,
      ...(pid ? { pid } : {})
    }))
  }
  if (isKde(env)) {
    const found = await kwinWindows(process.pid)
    if (found) return found.map((window) => ({ ...window, id: `kwin:${window.id}` }))
  }
  // No Wayland, o X11 do XWayland só mostraria parte das janelas.
  if (env.XDG_SESSION_TYPE !== 'wayland') {
    const client = await XClient.open(env)
    if (client) {
      try {
        const found = await listXWindows(client, process.pid)
        if (found) return found.map(fromX)
      } finally {
        client.close()
      }
    }
  }
  return { error: unsupported(env) }
}

/** Traz a janela para a frente; false se o desktop não deixou. */
export async function activateWindow(
  window: WindowInfo,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (window.id.startsWith('kwin:')) return kwinActivate(window.id.slice(5))
  if (window.id.startsWith('win:')) return activateWindowsWindow(Number(window.id.slice(4)))
  const id = Number(window.id.slice(4))
  if (!window.id.startsWith('x11:') || !Number.isInteger(id)) return false
  const client = await XClient.open(env)
  if (!client) return false
  try {
    const current = await listXWindows(client, process.pid)
    const target = current?.find((candidate) => candidate.id === id)
    return target ? await activateXWindow(client, target) : false
  } finally {
    client.close()
  }
}

/**
 * As janelas que batem com o pedido ("Firefox", "konsole", um pedaço do título): primeiro as do
 * app com esse nome exato, senão as que têm o texto no nome do app ou no título. Na ordem da
 * lista (a mais à frente primeiro).
 */
export function findWindows(windows: WindowInfo[], query: string): WindowInfo[] {
  const wanted = fold(query)
  if (!wanted) return []
  const sameApp = windows.filter((window) => fold(window.app) === wanted)
  if (sameApp.length) return sameApp
  return windows.filter(
    (window) => fold(window.app).includes(wanted) || fold(window.title).includes(wanted)
  )
}

/** Uma linha por janela: "Firefox: “GitHub” (ativa)". */
export function describeWindow(window: WindowInfo): string {
  const flags = [window.active ? t('ativa') : '', window.minimized ? t('minimizada') : ''].filter(
    Boolean
  )
  const title = window.title ? `: “${window.title.slice(0, 120)}”` : ''
  return `${window.app || t('sem nome')}${title}${flags.length ? ` (${flags.join(', ')})` : ''}`
}

// O mascote numa janela (Fase 48): soltar o mascote em cima de uma janela (com o Ctrl apertado)
// ou apertar o atalho da janela da frente leva o print dela, com o título e o programa, para a
// conversa em foco (o print como anexo e uma linha na caixa, sem mandar). A janela sob o mascote
// é a primeira da pilha (da mais à frente para a mais atrás) que contém o ponto; o print é o da
// própria janela (o desktopCapturer), então o mascote em cima dela não aparece. No X11 e no
// Windows; no Wayland, o sistema não deixa um app ver as janelas dos outros.

import { desktopCapturer, screen } from 'electron'
import type { Rectangle } from 'electron'
import { saveIncoming } from './attachments'
import type { Chat as ChatApi } from './chat-types'
import { currentDesktop, listXWindows, onDesktop, XClient } from './ewmh'
import type { Notify } from './notify'
import { IS_WINDOWS } from './platform'
import { thumbnailOf } from './screenshot'
import { windowsWindows } from './windows-win'
import type { DroppedFiles } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Uma janela que dá para mostrar ao Claude. */
export interface ContextWindow {
  /** O id da fonte no desktopCapturer ("window:<id>:0"). */
  source: string
  app: string
  title: string
  /** Em DIP, como as posições do Electron. */
  bounds: Rectangle
  active: boolean
}

const inside = (point: { x: number; y: number }, rect: Rectangle): boolean =>
  point.x >= rect.x &&
  point.y >= rect.y &&
  point.x < rect.x + rect.width &&
  point.y < rect.y + rect.height

/** A janela de cima que contém o ponto (a lista vem da mais à frente para a mais atrás). */
export function windowAt(
  windows: ContextWindow[],
  point: { x: number; y: number }
): ContextWindow | null {
  return windows.find((window) => inside(point, window.bounds)) ?? null
}

/** A janela da frente: a ativa (fora o Wisp), ou a de cima, se o Wisp estiver na frente. */
export function frontWindow(windows: ContextWindow[]): ContextWindow | null {
  return windows.find((window) => window.active) ?? windows[0] ?? null
}

/** A linha que vai para a caixa com o print. */
export const windowLine = (window: ContextWindow): string =>
  window.app
    ? t('Na imagem, a janela "{title}" ({app}).', { title: window.title, app: window.app })
    : t('Na imagem, a janela "{title}".', { title: window.title })

/** As janelas à vista, da mais à frente para a mais atrás, sem as do Wisp. */
export async function contextWindows(
  env: NodeJS.ProcessEnv = process.env
): Promise<ContextWindow[] | { error: string }> {
  if (IS_WINDOWS) {
    const found = await windowsWindows(process.pid)
    if (!found) return { error: t('O Windows não respondeu com a lista de janelas.') }
    return found
      .filter((window) => !window.minimized && (window.width ?? 0) > 0 && (window.height ?? 0) > 0)
      .map((window) => ({
        source: `window:${window.id}:0`,
        app: window.app ?? '',
        title: window.title,
        bounds: screen.screenToDipRect(null, {
          x: window.x ?? 0,
          y: window.y ?? 0,
          width: window.width ?? 0,
          height: window.height ?? 0
        }),
        active: window.active
      }))
  }
  if (env.XDG_SESSION_TYPE === 'wayland' || !env.DISPLAY) {
    return {
      error: t(
        'No Wayland, o sistema não deixa um app ver as janelas dos outros: use o Print da tela ou o Recortar.'
      )
    }
  }
  const client = await XClient.open(env)
  if (!client) return { error: t('Não consegui falar com o servidor X.') }
  try {
    const listed = await listXWindows(client, process.pid)
    if (!listed)
      return { error: t('O gerenciador de janelas não informa as janelas abertas (EWMH).') }
    const desktop = await currentDesktop(client)
    // No X11, os pixels do X viram DIP pela escala (a mesma em todas as telas).
    const scale = screen.getPrimaryDisplay().scaleFactor || 1
    const out: ContextWindow[] = []
    for (const window of listed) {
      if (window.minimized || !onDesktop(window, desktop)) continue
      const geometry = await client.geometry(window.id)
      if (!geometry || !geometry.width || !geometry.height) continue
      out.push({
        source: `window:${window.id}:0`,
        app: window.app,
        title: window.title,
        bounds: {
          x: Math.round(geometry.x / scale),
          y: Math.round(geometry.y / scale),
          width: Math.round(geometry.width / scale),
          height: Math.round(geometry.height / scale)
        },
        active: window.active
      })
    }
    return out
  } finally {
    client.close()
  }
}

/** O print da própria janela (mesmo coberta por outra, onde o compositor guarda o conteúdo). */
export async function captureWindow(window: ContextWindow): Promise<DroppedFiles> {
  const scale = screen.getDisplayMatching(window.bounds).scaleFactor || 1
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: {
        width: Math.round(window.bounds.width * scale),
        height: Math.round(window.bounds.height * scale)
      },
      fetchWindowIcons: false
    })
    const source =
      sources.find((candidate) => candidate.id === window.source) ??
      sources.find((candidate) => candidate.name === window.title)
    if (!source || source.thumbnail.isEmpty()) {
      return {
        files: [],
        problems: [t('Não consegui o print da janela "{title}".', { title: window.title })]
      }
    }
    const saved = await saveIncoming(source.thumbnail.toPNG(), 'janela', 'png')
    const thumbnail = thumbnailOf(source.thumbnail)
    return { files: [{ ...saved, ...(thumbnail ? { thumbnail } : {}) }], problems: [] }
  } catch (err) {
    return { files: [], problems: [(err as Error).message] }
  }
}

/** Leva a janela para a conversa em foco: o print como anexo e a linha na caixa. */
async function attach(
  pick: (windows: ContextWindow[]) => ContextWindow | null,
  chat: ChatApi | null,
  notify: Notify
): Promise<void> {
  const windows = await contextWindows()
  if ('error' in windows) {
    notify(t('Não deu para ver a janela'), windows.error)
    return
  }
  const window = pick(windows)
  if (!window) {
    notify(t('Nenhuma janela aqui'), t('Solte o mascote em cima da janela que você quer mostrar.'))
    return
  }
  const dropped = await captureWindow(window)
  chat?.attach(dropped)
  if (dropped.files.length) chat?.compose(windowLine(window))
}

/** O mascote foi solto com o Ctrl em cima de uma janela (o ponto em DIP). */
export const attachWindowAt = (
  point: { x: number; y: number },
  chat: ChatApi | null,
  notify: Notify
): Promise<void> => attach((windows) => windowAt(windows, point), chat, notify)

/** O atalho da janela da frente. */
export const attachFrontWindow = (chat: ChatApi | null, notify: Notify): Promise<void> =>
  attach(frontWindow, chat, notify)

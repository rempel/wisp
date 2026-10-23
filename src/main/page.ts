import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { join } from 'path'
import { getLocale } from '../shared/i18n'

/** Preload compartilhado pelas janelas (expõe window.wisp). */
export const PRELOAD = join(__dirname, '../preload/index.js')

/** Se uma página recarregada cair de novo antes disso, fica como está (evita um laço). */
const CRASH_LOOP_MS = 10_000

/**
 * Recarrega a página quando o processo dela cai (falta de memória, falha do Chromium). Se ela
 * cair de novo logo depois de recarregar, desiste, para não entrar num laço.
 */
export function reloadOnCrash(win: BrowserWindow, onReload?: () => void): void {
  let lastReload = 0
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    console.warn(`[wisp] a página caiu (${details.reason}); recarregando.`)
    if (Date.now() - lastReload < CRASH_LOOP_MS) return
    lastReload = Date.now()
    win.webContents.reload()
    onReload?.()
  })
}

/** Carrega uma página do renderer: do servidor do Vite em dev, dos arquivos da build fora dele. */
export function loadPage(win: BrowserWindow, page: 'mascot' | 'chat'): void {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}/${page}/index.html?lang=${getLocale()}`)
  } else {
    // O idioma vai na URL: a página o lê antes de montar qualquer texto (Fase 25).
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`), {
      query: { lang: getLocale() }
    })
  }
}

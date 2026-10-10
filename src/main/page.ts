import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { join } from 'path'

/** Preload compartilhado pelas janelas (expõe window.wisp). */
export const PRELOAD = join(__dirname, '../preload/index.js')

/** Carrega uma página do renderer: do servidor do Vite em dev, dos arquivos da build fora dele. */
export function loadPage(win: BrowserWindow, page: 'mascot' | 'chat'): void {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}/${page}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
  }
}

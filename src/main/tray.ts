import { Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/tray.png?asset'

export interface TrayActions {
  mascotVisible(): boolean
  setMascotVisible(visible: boolean): void
  newConversation(): void
  openConfig(): void
  quit(): void
}

// Guardado aqui para o ícone não ser coletado pelo garbage collector e sumir da bandeja.
let tray: Tray | null = null

/**
 * Ícone na bandeja (seção 7.3). Tudo fica no menu: no Linux, muitos painéis (inclusive a
 * extensão AppIndicator do GNOME) não repassam o clique no ícone ao app.
 */
export function setupTray(actions: TrayActions): void {
  try {
    tray = new Tray(nativeImage.createFromPath(trayIcon))
  } catch (err) {
    console.warn('[wisp] não consegui criar o ícone na bandeja:', err)
    return
  }
  tray.setToolTip('Wisp')

  const refresh = (): void => {
    const visible = actions.mascotVisible()
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? 'Ocultar mascote' : 'Mostrar mascote',
          click: () => {
            actions.setMascotVisible(!visible)
            refresh()
          }
        },
        { label: 'Nova conversa', click: () => actions.newConversation() },
        { label: 'Abrir config', click: () => actions.openConfig() },
        { type: 'separator' },
        { label: 'Sair', click: () => actions.quit() }
      ])
    )
  }
  refresh()
}

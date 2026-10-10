import { Menu, nativeImage, Tray } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import trayIcon from '../../resources/tray.png?asset'

export interface TrayActions {
  mascotVisible(): boolean
  setMascotVisible(visible: boolean): void
  newConversation(): void
  soundEnabled(): boolean
  setSoundEnabled(enabled: boolean): void
  openConfig(): void
  quit(): void
}

export interface AppMenu {
  /** Algo do menu mudou (mascote escondido, sons): monta de novo. */
  refresh(): void
  /** Abre o mesmo menu junto do mascote (botão direito nele). */
  popup(window: BrowserWindow): void
}

// Guardado aqui para o ícone não ser coletado pelo garbage collector e sumir da bandeja.
let tray: Tray | null = null

/**
 * Ícone na bandeja (seção 7.3) e o mesmo menu no botão direito do mascote. Tudo fica no menu: no
 * Linux, muitos painéis (inclusive a extensão AppIndicator do GNOME) não repassam o clique no
 * ícone ao app, e o GNOME sem a extensão nem mostra a bandeja.
 */
export function setupTray(actions: TrayActions): AppMenu {
  const template = (): MenuItemConstructorOptions[] => {
    const visible = actions.mascotVisible()
    return [
      {
        label: visible ? 'Ocultar mascote' : 'Mostrar mascote',
        click: () => {
          actions.setMascotVisible(!visible)
          refresh()
        }
      },
      { label: 'Nova conversa', click: () => actions.newConversation() },
      {
        label: 'Sons',
        type: 'checkbox',
        checked: actions.soundEnabled(),
        click: (item) => actions.setSoundEnabled(item.checked)
      },
      { label: 'Abrir config', click: () => actions.openConfig() },
      { type: 'separator' },
      { label: 'Sair', click: () => actions.quit() }
    ]
  }
  const refresh = (): void => {
    tray?.setContextMenu(Menu.buildFromTemplate(template()))
  }

  try {
    tray = new Tray(nativeImage.createFromPath(trayIcon))
    tray.setToolTip('Wisp')
    refresh()
  } catch (err) {
    console.warn('[wisp] não consegui criar o ícone na bandeja:', err)
  }

  return {
    refresh,
    popup(window) {
      Menu.buildFromTemplate(template()).popup({ window })
    }
  }
}

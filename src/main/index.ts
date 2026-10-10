import { app } from 'electron'
import { join } from 'path'
import { setupChat } from './chat'
import { CONFIG_PATH, loadConfig } from './config'
import { getMascotBounds, setupMascot } from './mascot'
import { CACHE_DIR } from './paths'

// O cache e os dados internos do Chromium ficam fora de ~/.config/wisp, que guarda só o
// config.json. Precisa ser definido antes do app ficar pronto.
app.setPath('userData', join(CACHE_DIR, 'electron'))

if (
  process.platform === 'linux' &&
  process.env.XDG_SESSION_TYPE === 'wayland' &&
  app.commandLine.getSwitchValue('ozone-platform') !== 'x11'
) {
  console.warn(
    '[wisp] Rodando como app Wayland nativo: o mascote não consegue se posicionar nem ficar ' +
      'sempre no topo. Inicie com --ozone-platform=x11 (o `npm run dev` já faz isso).'
  )
}

app.whenReady().then(() => {
  loadConfig()
  console.log(`[wisp] config: ${CONFIG_PATH}`)

  const chat = setupChat(getMascotBounds)
  setupMascot(() => chat.toggle())

  app.on('before-quit', () => chat.dispose())
})

app.on('window-all-closed', () => {
  app.quit()
})

// As integrações com o sistema que você liga nas configurações (Fases 64, 67 e 72): o "Perguntar
// ao Wisp" do gerenciador de arquivos, o comando `wisp` no PATH do Windows e o Wisp na busca do
// desktop (KRunner e GNOME). Cada uma acompanha o config.json: ligar põe, desligar tira.

import { getConfig, onConfigChange } from './config'
import { setFileMenu, setWindowsCommand } from './file-menu'
import { setGnomeExtension } from './gnome-shell'
import { IS_LINUX } from './platform'
import { removeSearchFiles, startSearchProvider } from './search-provider'
import type { SearchProvider } from './search-provider'

export function setupIntegrations(ask: (question: string) => void): { dispose(): void } {
  let now = { menu: false, command: false, search: false, gnome: false }
  let provider: SearchProvider | null = null
  let starting = false

  const search = (enabled: boolean): void => {
    if (!IS_LINUX) return
    if (!enabled) {
      provider?.dispose()
      provider = null
      removeSearchFiles()
      return
    }
    if (provider || starting) return
    starting = true
    void startSearchProvider(ask)
      .then((started) => {
        // Desligada enquanto subia: sai de novo.
        if (getConfig().desktopSearch) provider = started
        else started?.dispose()
      })
      .catch((err) => console.warn('[wisp] a busca do desktop não subiu:', err))
      .finally(() => (starting = false))
  }

  const apply = (): void => {
    const config = getConfig()
    const next = {
      menu: config.fileManagerMenu,
      command: config.commandInPath,
      search: config.desktopSearch,
      gnome: config.gnomeExtension
    }
    if (next.menu !== now.menu) void setFileMenu(next.menu)
    if (next.command !== now.command) void setWindowsCommand(next.command)
    if (next.search !== now.search) search(next.search)
    if (next.gnome !== now.gnome && IS_LINUX) void setGnomeExtension(next.gnome)
    now = next
  }
  apply()
  onConfigChange(apply)
  return {
    dispose() {
      provider?.dispose()
      provider = null
    }
  }
}

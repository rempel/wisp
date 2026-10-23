import { readFileSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { APP_ID, desktopExec, MARKER, removeOwnFile, writeOwnFile } from './launcher'
import { t } from '../shared/i18n'

/** O .desktop em ~/.config/autostart que abre o Wisp quando você entra na sessão. */
export function autostartPath(env: NodeJS.ProcessEnv = process.env): string {
  const config = env.XDG_CONFIG_HOME
  // No Flatpak, o XDG_CONFIG_HOME é a pasta do app (~/.var/app/…): o autostart é o do sistema.
  const base = config && isAbsolute(config) && !env.FLATPAK_ID ? config : join(homedir(), '.config')
  return join(base, 'autostart', `${APP_ID}.desktop`)
}

function entry(icon: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Wisp',
    'Comment=Abre o Wisp quando você entra na sessão',
    `Exec=${desktopExec()}`,
    `Icon=${icon}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    // O desktop termina de subir (bandeja, portais) antes do Wisp.
    'X-GNOME-Autostart-Delay=3',
    MARKER,
    ''
  ].join('\n')
}

/** O Wisp abre com o sistema? (Só conta o arquivo dele, com a marca.) */
export function isAutostartEnabled(): boolean {
  try {
    return readFileSync(autostartPath(), 'utf8').includes(MARKER)
  } catch {
    return false
  }
}

/**
 * Liga ou desliga o início com o sistema. Nunca mexe num arquivo com o mesmo nome que não seja do
 * Wisp: devolve o motivo, para o menu avisar.
 */
export function setAutostart(enabled: boolean, icon: string): string | null {
  const path = autostartPath()
  try {
    if (enabled) {
      return writeOwnFile(path, entry(icon))
        ? null
        : t('{path} já existe e não é do Wisp', { path })
    }
    return removeOwnFile(path) ? null : t('{path} não é do Wisp; tire-o à mão', { path })
  } catch (err) {
    return (err as Error).message
  }
}

/** Ligado, o arquivo é reescrito a cada abertura, para acompanhar o lugar do app. */
export function refreshAutostart(icon: string): void {
  if (!isAutostartEnabled()) return
  try {
    writeOwnFile(autostartPath(), entry(icon))
  } catch (err) {
    console.warn('[wisp] não consegui atualizar o início com o sistema:', err)
  }
}

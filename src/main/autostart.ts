import { readFileSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { APP_ID, desktopExec, MARKER, removeOwnFile, writeOwnFile } from './launcher'

/** O .desktop em ~/.config/autostart que abre o Wisp quando você entra na sessão. */
export function autostartPath(env: NodeJS.ProcessEnv = process.env): string {
  const config = env.XDG_CONFIG_HOME
  const base = config && isAbsolute(config) ? config : join(homedir(), '.config')
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
      return writeOwnFile(path, entry(icon)) ? null : `${path} já existe e não é do Wisp`
    }
    return removeOwnFile(path) ? null : `${path} não é do Wisp; tire-o à mão`
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

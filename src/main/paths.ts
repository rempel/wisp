import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { IS_WINDOWS } from './platform'

/** Pasta base do XDG: usa a variável se for um caminho absoluto, senão o padrão em ~. */
function xdgHome(variable: string, fallback: string): string {
  const value = process.env[variable]
  return value && isAbsolute(value) ? value : join(homedir(), fallback)
}

/**
 * No Windows (Fase 33): o config.json em %APPDATA%\Wisp (vai junto com o perfil), e o resto em
 * %LOCALAPPDATA%\Wisp (fica na máquina).
 */
function windowsHome(variable: 'APPDATA' | 'LOCALAPPDATA', fallback: string): string {
  return join(xdgHome(variable, fallback), 'Wisp')
}

/** ~/.config/wisp (no Windows, %APPDATA%\Wisp): só o config.json. */
export const CONFIG_DIR = IS_WINDOWS
  ? windowsHome('APPDATA', 'AppData/Roaming')
  : join(xdgHome('XDG_CONFIG_HOME', '.config'), 'wisp')

/** ~/.local/share/wisp (no Windows, %LOCALAPPDATA%\Wisp): dados do app, como o workspace. */
export const DATA_DIR = IS_WINDOWS
  ? windowsHome('LOCALAPPDATA', 'AppData/Local')
  : join(xdgHome('XDG_DATA_HOME', '.local/share'), 'wisp')

/** ~/.cache/wisp (no Windows, %LOCALAPPDATA%\Wisp\Cache): dados do Chromium, anexos. */
export const CACHE_DIR = IS_WINDOWS
  ? join(windowsHome('LOCALAPPDATA', 'AppData/Local'), 'Cache')
  : join(xdgHome('XDG_CACHE_HOME', '.cache'), 'wisp')

/** ~/.local/state/wisp (no Windows, %LOCALAPPDATA%\Wisp\Logs): o registro. */
export const STATE_DIR = IS_WINDOWS
  ? join(windowsHome('LOCALAPPDATA', 'AppData/Local'), 'Logs')
  : join(xdgHome('XDG_STATE_HOME', '.local/state'), 'wisp')

/** Expande um "~" no começo do caminho (no Windows, também "~\"). */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || (IS_WINDOWS && path.startsWith('~\\'))) {
    return join(homedir(), path.slice(2))
  }
  return path
}

/**
 * Pasta só do usuário para arquivos de vida curta (o token do MCP, o modo de cada conversa):
 * $XDG_RUNTIME_DIR (tmpfs) ou o cache.
 */
export function runtimeDir(): string {
  // No Windows, uma pasta dentro de %LOCALAPPDATA%, que só o usuário lê.
  if (IS_WINDOWS) return join(DATA_DIR, 'Run')
  const xdg = process.env.XDG_RUNTIME_DIR
  if (!xdg || !isAbsolute(xdg)) return CACHE_DIR
  // No Flatpak, só a pasta do app no XDG_RUNTIME_DIR é a mesma dentro e fora do sandbox (o Claude
  // Code, fora, lê o --mcp-config e o arquivo do modo daqui).
  const flatpak = process.env.FLATPAK_ID
  return flatpak ? join(xdg, 'app', flatpak, 'wisp') : join(xdg, 'wisp')
}

import { homedir } from 'os'
import { isAbsolute, join } from 'path'

/** Pasta base do XDG: usa a variável se for um caminho absoluto, senão o padrão em ~. */
function xdgHome(variable: string, fallback: string): string {
  const value = process.env[variable]
  return value && isAbsolute(value) ? value : join(homedir(), fallback)
}

/** ~/.config/wisp: só o config.json. */
export const CONFIG_DIR = join(xdgHome('XDG_CONFIG_HOME', '.config'), 'wisp')

/** ~/.local/share/wisp: dados do app, como o workspace do Claude Code. */
export const DATA_DIR = join(xdgHome('XDG_DATA_HOME', '.local/share'), 'wisp')

/** ~/.cache/wisp: coisas descartáveis (dados do Chromium, anexos). */
export const CACHE_DIR = join(xdgHome('XDG_CACHE_HOME', '.cache'), 'wisp')

/** Expande um "~" no começo do caminho. */
export function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path
}

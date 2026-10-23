// O Wisp dentro de um Flatpak (Fase 25). O sandbox não tem o Claude Code nem os programas do seu
// sistema (o terminal, o editor, o gh, o whisper): eles rodam fora, pelo `flatpak-spawn --host`,
// com as variáveis que o Wisp muda passadas pelo `env` (o flatpak-spawn não leva o ambiente de
// dentro). Fora do Flatpak, nada muda. O que o pacote libera está no README.

import { existsSync } from 'fs'
import { join } from 'path'

/** O id do Flatpak, quando o Wisp roda dentro de um; null fora dele. */
export function flatpakId(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.FLATPAK_ID) return env.FLATPAK_ID
  return existsSync('/.flatpak-info') ? 'io.github.rempel.Wisp' : null
}

/** O Wisp está num Flatpak? */
export const IN_FLATPAK = flatpakId() !== null

/** Onde o sandbox enxerga o /usr do sistema (com --filesystem=host-os). */
export const HOST_ROOT = '/run/host'

/** As pastas de programas do sistema, como o sandbox as vê. */
export function hostProgramDirs(): string[] {
  if (!IN_FLATPAK) return []
  return ['usr/local/bin', 'usr/bin', 'bin'].map((dir) => join(HOST_ROOT, dir))
}

/** O caminho como o sistema o vê (um programa achado em /run/host/usr/bin é o /usr/bin dele). */
export function hostPath(path: string): string {
  return path.startsWith(`${HOST_ROOT}/`) ? path.slice(HOST_ROOT.length) : path
}

/**
 * Variáveis que só fazem sentido dentro do sandbox: não vão para os programas do sistema (o PATH
 * de dentro, as pastas XDG do Flatpak, as bibliotecas do runtime).
 */
const SANDBOX_ONLY = new Set([
  'PATH',
  'LD_LIBRARY_PATH',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'XDG_DATA_DIRS',
  'FLATPAK_ID',
  'FLATPAK_SANDBOX_DIR',
  'container',
  'TMPDIR',
  'GIO_EXTRA_MODULES',
  'GST_PLUGIN_SYSTEM_PATH',
  'ZYPAK_BIN',
  'ZYPAK_LIB'
])

export interface HostCommand {
  command: string
  args: string[]
}

/**
 * O comando para rodar um programa do sistema. Dentro do Flatpak: `flatpak-spawn --host`, na pasta
 * pedida, com `env` tirando as variáveis que o Wisp tirou (e as de `unset`, que o sistema pode ter
 * mesmo sem o sandbox ter) e pondo as que ele mudou. Fora, o próprio programa.
 */
export function viaHost(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv
    cwd?: string
    unset?: string[]
    base?: NodeJS.ProcessEnv
    inFlatpak?: boolean
  } = {}
): HostCommand {
  if (!(options.inFlatpak ?? IN_FLATPAK)) return { command, args }
  const base = options.base ?? process.env
  const env = options.env ?? base
  const unset = new Set(options.unset ?? [])
  for (const key of Object.keys(base)) if (!(key in env)) unset.add(key)
  const set = Object.entries(env)
    .filter(([key, value]) => value !== undefined && base[key] !== value)
    .map(([key, value]) => `${key}=${value}`)
  const keep = (key: string): boolean => !SANDBOX_ONLY.has(key)
  return {
    command: 'flatpak-spawn',
    args: [
      '--host',
      '--watch-bus',
      ...(options.cwd ? [`--directory=${options.cwd}`] : []),
      'env',
      ...[...unset].filter(keep).flatMap((key) => ['-u', key]),
      ...set.filter((pair) => keep(pair.slice(0, pair.indexOf('=')))),
      hostPath(command),
      ...args
    ]
  }
}

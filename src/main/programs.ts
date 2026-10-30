import { accessSync, constants, statSync } from 'fs'
import { homedir } from 'os'
import { extname, isAbsolute, join } from 'path'
import { DATA_DIR, expandHome } from './paths'
import { hostProgramDirs } from './host'
import { IS_WINDOWS } from './platform'
import { pathDirs } from './win'

// Achar um programa que o usuário instalou à parte (o whisper-cli, o piper): pelo caminho do
// config.json ou pelo nome, no PATH e nas pastas de sempre de quem instala na mão. No Windows
// (Fase 35), o nome sem extensão é o .exe, e as pastas são as absolutas do PATH e a da voz do Wisp.

/**
 * No Windows, onde o README manda pôr o whisper.cpp e o Piper (o zip do whisper.cpp traz uma
 * pasta Release).
 */
export const VOICE_DIR = join(DATA_DIR, 'Voz')
const WINDOWS_DIRS = [
  VOICE_DIR,
  join(VOICE_DIR, 'whisper'),
  join(VOICE_DIR, 'whisper', 'Release'),
  join(VOICE_DIR, 'piper')
]

/** O config.json fala de um caminho (e não de um nome)? No Windows, também com \ ou C:. */
const isPath = (text: string): boolean =>
  text.includes('/') || (IS_WINDOWS && (text.includes('\\') || /^[a-z]:/i.test(text)))

/** O nome como o Windows o roda: sem extensão, o .exe. */
const withExe = (name: string): string => (IS_WINDOWS && !extname(name) ? `${name}.exe` : name)

/** Um arquivo que dá para rodar. */
export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * O programa: `configured` é um caminho (com / ou ~) ou um nome. Sem caminho, procura o nome e
 * depois os `names` no PATH, em ~/.local/bin e nas `extraDirs`.
 */
export function findProgram(
  configured: string,
  names: string[],
  extraDirs: string[] = [],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const wanted = configured.trim()
  if (isPath(wanted)) {
    const path = withExe(expandHome(wanted))
    return isAbsolute(path) && isExecutable(path) ? path : null
  }
  const candidates = wanted ? [wanted, ...names.filter((name) => name !== wanted)] : names
  const dirs = [
    // No Windows, uma pasta relativa no PATH seria a pasta atual.
    ...pathDirs(env).filter((dir) => !IS_WINDOWS || isAbsolute(dir)),
    join(homedir(), '.local', 'bin'),
    ...extraDirs.map(expandHome),
    ...(IS_WINDOWS ? WINDOWS_DIRS : []),
    // No Flatpak, os programas do sistema (vistos em /run/host).
    ...hostProgramDirs()
  ]
  for (const name of candidates.map(withExe)) {
    for (const dir of dirs) {
      const path = join(dir, name)
      if (isExecutable(path)) return path
    }
  }
  return null
}

/** Um arquivo comum que existe (um modelo de voz). */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

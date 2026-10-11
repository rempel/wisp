import { accessSync, constants, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join } from 'path'
import { expandHome } from './paths'

// Achar um programa que o usuário instalou à parte (o whisper-cli, o piper): pelo caminho do
// config.json ou pelo nome, no PATH e nas pastas de sempre de quem instala na mão.

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
  if (wanted.includes('/')) {
    const path = expandHome(wanted)
    return isAbsolute(path) && isExecutable(path) ? path : null
  }
  const candidates = wanted ? [wanted, ...names.filter((name) => name !== wanted)] : names
  const dirs = [
    ...(env.PATH ?? '').split(delimiter).filter(Boolean),
    join(homedir(), '.local', 'bin'),
    ...extraDirs.map(expandHome)
  ]
  for (const name of candidates) {
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

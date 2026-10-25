// O backup datado de um arquivo de configuração antes de o Wisp mexer nele (os hooks no
// settings.json, Fase 7; os servidores MCP no ~/.claude.json, Fase 30), ao lado do original.

import { constants, copyFileSync } from 'fs'

/** "2026-10-10-124501", para o nome do backup. */
export function stamp(date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  )
}

/** Copia o arquivo para o backup sem sobrescrever outro: "…-124501", "…-124501-2"… */
export function backupFile(source: string, name: string): string {
  for (let n = 1; ; n++) {
    const target = n === 1 ? name : `${name}-${n}`
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL)
      return target
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 100) throw err
    }
  }
}

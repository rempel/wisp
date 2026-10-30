// Como rodar o próprio Wisp (Fase 33): o Wisp.exe instalado ou, no código, o Electron com a pasta
// do app. O Claude Code o roda nos hooks do Windows (forma exec, sem shell); o index.ts define ao
// abrir.

let selfCommand: { command: string; args: string[] } | null = null

export function setSelfCommand(command: string, args: string[]): void {
  selfCommand = { command, args }
}

/** O executável do Wisp e os argumentos dele (null antes de o app definir). */
export function selfCommandOf(): { command: string; args: string[] } | null {
  return selfCommand
}

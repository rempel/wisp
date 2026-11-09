// Os terminais da bancada (Fase 55): o seu shell num pseudo-terminal (node-pty), ao lado da
// conversa, para rodar o servidor do projeto, os testes ou o git sem sair do Wisp. É você quem
// digita: o Claude não lê nem escreve aqui (o que ele roda continua passando pelos cards). O
// shell sobe com spawn e a lista de argumentos, na pasta da conversa, com o ambiente do app sem
// as variáveis do npm e do Electron.

import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { basename, isAbsolute } from 'path'
import type { TerminalLaunch } from './claude-settings'
import { usableFolder } from './folders'
import { IN_FLATPAK, viaHost } from './host'
import { expandHome } from './paths'
import { IS_WINDOWS } from './platform'
import { TerminalProcess } from './tui'
import { MAX_SHELLS } from '../shared/ipc-workbench'
import type { ShellInfo } from '../shared/ipc-workbench'
import { t } from '../shared/i18n'

/** No Flatpak, o shell é o do sistema: quem sabe qual é ele é o ambiente de lá. */
const HOST_SHELL = 'exec "${SHELL:-/bin/bash}"'

/** O shell da pessoa: o $SHELL (um caminho inteiro que existe), ou o bash, ou o sh. */
export function shellProgram(
  env: NodeJS.ProcessEnv = process.env,
  windows = IS_WINDOWS,
  exists: (path: string) => boolean = existsSync
): string {
  if (windows) return 'powershell.exe'
  const shell = env.SHELL
  if (shell && isAbsolute(shell) && exists(shell)) return shell
  return exists('/bin/bash') ? '/bin/bash' : '/bin/sh'
}

/** O ambiente do shell: o do app, sem o que o npm e o Electron puseram nele. */
export function shellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env }
  for (const key of Object.keys(clean)) {
    if (key.startsWith('npm_') || key.startsWith('ELECTRON_') || key === 'CHROME_DESKTOP') {
      delete clean[key]
    }
  }
  clean.TERM_PROGRAM = 'Wisp'
  return clean
}

/** Como subir o shell numa pasta (a da conversa; sem ela, ou se ela sumiu, a pasta pessoal). */
export function shellLaunch(folder: string | null, inFlatpak = IN_FLATPAK): TerminalLaunch {
  const cwd = (folder ? usableFolder(expandHome(folder)) : null) ?? homedir()
  const env = shellEnv()
  if (!inFlatpak) return { file: shellProgram(), args: [], env, cwd }
  const host = viaHost('sh', ['-c', HOST_SHELL], { env, cwd, inFlatpak: true })
  return { file: host.command, args: host.args, env, cwd }
}

export interface ShellsHost {
  /** A saída de um terminal. */
  data(id: string, chunk: string): void
  /** A lista mudou (um novo, um que saiu, um fechado). */
  changed(): void
}

/** Os terminais abertos na bancada. */
export class Shells {
  private readonly items = new Map<string, { info: ShellInfo; proc: TerminalProcess }>()

  constructor(private readonly host: ShellsHost) {}

  list(): ShellInfo[] {
    return [...this.items.values()].map((item) => ({ ...item.info }))
  }

  /** Um terminal novo; devolve o id dele, ou o motivo de não dar. */
  create(folder: string | null): string | { error: string } {
    if (this.items.size >= MAX_SHELLS) {
      return { error: t('A bancada tem no máximo {max} terminais.', { max: MAX_SHELLS }) }
    }
    const id = randomBytes(6).toString('hex')
    const launch = shellLaunch(folder)
    const info: ShellInfo = {
      id,
      title: basename(launch.cwd) || launch.cwd,
      cwd: launch.cwd,
      exited: false
    }
    const proc = new TerminalProcess({
      data: (chunk) => {
        if (this.items.has(id)) this.host.data(id, chunk)
      },
      exit: () => {
        if (!this.items.has(id)) return
        info.exited = true
        this.host.data(id, `\r\n\u001b[2m[${t('O shell saiu.')}]\u001b[0m\r\n`)
        this.host.changed()
      }
    })
    try {
      proc.start(launch)
    } catch (err) {
      return {
        error: t('Não deu para abrir o terminal: {why}', { why: (err as Error).message })
      }
    }
    this.items.set(id, { info, proc })
    this.host.changed()
    return id
  }

  close(id: string): void {
    const item = this.items.get(id)
    if (!item) return
    this.items.delete(id)
    void item.proc.kill()
    this.host.changed()
  }

  /** O que o terminal já mostrou (a página repõe a tela). */
  attach(id: string): string {
    return this.items.get(id)?.proc.snapshot() ?? ''
  }

  input(id: string, data: string): void {
    this.items.get(id)?.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.items.get(id)?.proc.resize(cols, rows)
  }

  /** O app está fechando: os shells saem junto. */
  dispose(): void {
    for (const item of this.items.values()) void item.proc.kill()
    this.items.clear()
  }
}

// Os terminais da bancada (Fase 55): o seu shell num pseudo-terminal (node-pty), ao lado da
// conversa, para rodar o servidor do projeto, os testes ou o git sem sair do Wisp. Nos seus, é
// você quem digita: o Claude não lê nem escreve neles. O Claude tem o dele, um por conversa
// (Fase 57): roda ali o que você aprovou no card e lê a saída, com tudo à sua vista. O shell sobe com spawn e a lista de argumentos, na pasta da conversa, com o ambiente do app sem
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

/** As sequências de controle do terminal (cores, cursor, título): saem do texto que o Claude lê. */
const CONTROL = new RegExp(
  [
    '\\u001b\\[[0-?]*[ -/]*[@-~]', // CSI: cores, cursor, apagar
    '\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)', // OSC: o título da janela
    '\\u001b[@-Z\\\\-_]', // as de dois caracteres
    '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]' // o resto dos controles
  ].join('|'),
  'g'
)

/**
 * A saída de um terminal como texto: sem as sequências de controle, e com cada linha como
 * ficou na tela (o que veio depois de um \r escreve por cima: as barras de progresso).
 */
export function plainOutput(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const parts = line.replace(CONTROL, '').split('\r')
      return (parts.filter((part) => part.length).pop() ?? '').trimEnd()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** As últimas `count` linhas de um texto. */
export function lastLines(text: string, count: number): string {
  const lines = text.split('\n')
  return lines.slice(Math.max(0, lines.length - count)).join('\n')
}

/** Quanto esperar sem saída nova para dar o comando por parado (ms). */
const QUIET_MS = 1200

export interface ShellsHost {
  /** A saída de um terminal. */
  data(id: string, chunk: string): void
  /** A lista mudou (um novo, um que saiu, um fechado). */
  changed(): void
}

/** Os terminais abertos na bancada. */
export class Shells {
  private readonly items = new Map<
    string,
    { info: ShellInfo; proc: TerminalProcess; owner: string | null; total: number; last: number }
  >()

  constructor(private readonly host: ShellsHost) {}

  list(): ShellInfo[] {
    return [...this.items.values()].map((item) => ({ ...item.info }))
  }

  /** Um terminal novo; devolve o id dele, ou o motivo de não dar. */
  create(folder: string | null, owner: string | null = null): string | { error: string } {
    if (this.items.size >= MAX_SHELLS) {
      return { error: t('A bancada tem no máximo {max} terminais.', { max: MAX_SHELLS }) }
    }
    const id = randomBytes(6).toString('hex')
    const launch = shellLaunch(folder)
    const name = basename(launch.cwd) || launch.cwd
    const info: ShellInfo = {
      id,
      title: owner ? `Claude · ${name}` : name,
      cwd: launch.cwd,
      exited: false,
      ...(owner ? { claude: true } : {})
    }
    const proc = new TerminalProcess({
      data: (chunk) => {
        const item = this.items.get(id)
        if (!item) return
        item.total += chunk.length
        item.last = Date.now()
        this.host.data(id, chunk)
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
    this.items.set(id, { info, proc, owner, total: 0, last: Date.now() })
    this.host.changed()
    return id
  }

  /** O terminal do Claude numa conversa (o que ainda roda), criado na pasta dela se não houver. */
  forOwner(owner: string, folder: string | null): string | { error: string } {
    for (const [id, item] of this.items) {
      if (item.owner === owner && !item.info.exited) return id
    }
    // Um que já saiu dá o lugar ao novo.
    for (const [id, item] of this.items) if (item.owner === owner) this.close(id)
    return this.create(folder, owner)
  }

  /** O terminal do Claude numa conversa, se houver (mesmo que o shell já tenha saído). */
  ownedBy(owner: string): string | null {
    let found: string | null = null
    for (const [id, item] of this.items) if (item.owner === owner) found = id
    return found
  }

  /**
   * Digita um comando no terminal e espera a saída assentar (sem nada novo por um instante) ou
   * o prazo acabar. Devolve o que apareceu desde o comando, em texto; o comando pode seguir
   * rodando (um servidor), e o resto se lê com `tail`.
   */
  async run(id: string, command: string, waitMs: number): Promise<string | { error: string }> {
    const item = this.items.get(id)
    if (!item || item.info.exited) return { error: t('O terminal não está aberto.') }
    const mark = item.total
    // Um shell que acabou de subir ainda escreve o prompt: espera ele parar antes de digitar.
    const ready = Date.now()
    while (Date.now() - item.last < 300 && Date.now() - ready < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    item.proc.write(command.replace(/[\r\n]+$/, '') + '\r')
    const start = Date.now()
    item.last = start
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!this.items.has(id) || item.info.exited) break
      const now = Date.now()
      if (now - start >= waitMs) break
      if (item.total > mark && now - item.last >= QUIET_MS) break
    }
    const shown = item.proc.snapshot()
    return plainOutput(shown.slice(Math.max(0, shown.length - (item.total - mark))))
  }

  /**
   * Cola um texto num terminal seu, sem enviar (Fase 63): o Enter é seu. Usa o último terminal
   * seu que ainda roda, ou abre um na pasta dada. Devolve o id dele.
   */
  paste(text: string, folder: string | null): string | { error: string } {
    let id: string | null = null
    for (const [key, item] of this.items) if (!item.owner && !item.info.exited) id = key
    const target = id ?? this.create(folder)
    if (typeof target !== 'string') return target
    this.items.get(target)?.proc.paste(text, false)
    return target
  }

  /** As últimas linhas do que o terminal mostrou, em texto. */
  tail(id: string, lines: number): string {
    const item = this.items.get(id)
    return item ? lastLines(plainOutput(item.proc.snapshot()), lines) : ''
  }

  exited(id: string): boolean {
    return this.items.get(id)?.info.exited ?? true
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

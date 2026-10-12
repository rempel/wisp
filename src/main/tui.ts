// O modo terminal (Fase 17): o Claude Code de verdade, interativo, num pseudo-terminal (node-pty),
// mostrado na aba pelo xterm.js. O processo sobe com spawn e a lista de argumentos (nada passa
// por um shell), com o mesmo ambiente do chat (sem ANTHROPIC_API_KEY, a OpenRouter só se a aba
// a escolheu). Cada processo tem uma ficha nova: os hooks dele dizem de que aba são, e os de um
// processo que já foi embora não se confundem com os do próximo.

import { randomBytes } from 'crypto'
import { spawn } from 'node-pty'
import type { IPty } from 'node-pty'
import type { TerminalLaunch } from './claude'

/** O que a página recebe ao abrir a aba de novo: o fim do que o terminal mostrou. */
const MAX_BUFFER = 512 * 1024
/** Quanto esperar o Claude Code sair depois do SIGTERM antes do SIGKILL. */
const KILL_TIMEOUT_MS = 3000
/** O tamanho de um terminal novo, até a página medir o dela. */
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30

export interface TerminalCallbacks {
  /** Saída do terminal (texto com as sequências de controle). */
  data(chunk: string): void
  /** O processo saiu (o código, ou null se foi por um sinal). */
  exit(code: number | null): void
}

export class TerminalProcess {
  /** A ficha deste processo, que vai nos hooks dele (`--tab <ficha>`). */
  readonly token = randomBytes(16).toString('hex')
  private pty: IPty | null = null
  private buffer = ''
  private exited: Promise<void> = Promise.resolve()

  constructor(
    private readonly callbacks: TerminalCallbacks,
    private cols = DEFAULT_COLS,
    private rows = DEFAULT_ROWS
  ) {}

  get running(): boolean {
    return this.pty !== null
  }

  /** O que o terminal mostrou (o fim, até MAX_BUFFER), para a página repor a tela. */
  snapshot(): string {
    return this.buffer
  }

  start(launch: TerminalLaunch): void {
    const pty = spawn(launch.file, launch.args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: launch.cwd,
      env: launch.env as Record<string, string>
    })
    this.pty = pty
    let done!: () => void
    this.exited = new Promise((resolve) => (done = resolve))
    pty.onData((chunk) => {
      if (pty !== this.pty) return
      this.buffer = (this.buffer + chunk).slice(-MAX_BUFFER)
      this.callbacks.data(chunk)
    })
    pty.onExit(({ exitCode, signal }) => {
      done()
      if (pty !== this.pty) return
      this.pty = null
      this.callbacks.exit(signal ? null : exitCode)
    })
  }

  /** O que a pessoa digitou (ou o Wisp colou: a voz, o --ask). */
  write(data: string): void {
    this.pty?.write(data)
  }

  /** Cola um texto como se fosse colado no terminal (bracketed paste) e, se pedido, envia. */
  paste(text: string, submit: boolean): void {
    const pty = this.pty
    if (!pty) return
    // As marcas do bracketed paste dentro do texto acabariam a colagem antes da hora.
    const clean = text.split('\x1b[200~').join('').split('\x1b[201~').join('')
    pty.write(`\x1b[200~${clean}\x1b[201~`)
    // O Enter vai um pouco depois: o Claude Code trata a colagem antes de receber o envio.
    if (submit) setTimeout(() => this.pty === pty && pty.write('\r'), 120)
  }

  resize(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return
    this.cols = Math.min(Math.max(cols, 20), 500)
    this.rows = Math.min(Math.max(rows, 5), 300)
    try {
      this.pty?.resize(this.cols, this.rows)
    } catch {
      // O processo acabou de sair.
    }
  }

  /** Encerra o processo (SIGTERM, e SIGKILL se não sair a tempo). Resolve quando ele sai. */
  async kill(): Promise<void> {
    const pty = this.pty
    if (!pty) return
    this.pty = null
    const exited = this.exited
    try {
      pty.kill('SIGTERM')
    } catch {
      return
    }
    const timer = setTimeout(() => {
      try {
        pty.kill('SIGKILL')
      } catch {
        // Já saiu.
      }
    }, KILL_TIMEOUT_MS)
    await exited
    clearTimeout(timer)
  }
}

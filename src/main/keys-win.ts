// Segurar para falar no Windows (Fase 40). O atalho global do Electron só avisa quando a tecla é
// apertada; para saber quando ela é solta, um PowerShell pequeno pergunta ao Windows
// (GetAsyncKeyState) se a tecla ainda está para baixo. Ele só confere entre o aperto e o soltar:
// no resto do tempo fica parado esperando a próxima linha da entrada, sem gastar CPU. Abre no
// primeiro aperto (não com o Wisp) e fecha junto com os atalhos.
//
// O script é fixo; o que entra pela entrada é só o número da tecla (o código virtual do Windows).

import type { ChildProcessWithoutNullStreams } from 'child_process'
import { startPowerShell } from './powershell'

/** De quanto em quanto tempo (ms) o script confere a tecla, enquanto ela está apertada. */
export const KEY_POLL_MS = 30
/** Uma tecla presa por mais que isto conta como solta (um teclado que travou não ouve para sempre). */
const MAX_HOLD_MS = 2 * 60_000

const SCRIPT =
  "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; namespace Wisp { " +
  'public static class Teclas { [DllImport("user32.dll")] ' +
  "public static extern short GetAsyncKeyState(int tecla); } }'; " +
  // A entrada pela stream crua: o [Console]::In do PowerShell 5.1 leria de forma síncrona.
  '$leitor = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8); ' +
  "[Console]::Out.WriteLine('pronto'); " +
  'while ($null -ne ($linha = $leitor.ReadLine())) { ' +
  '$tecla = 0; if (-not [int]::TryParse($linha.Trim(), [ref]$tecla)) { continue }; ' +
  `$fim = [DateTime]::UtcNow.AddMilliseconds(${MAX_HOLD_MS}); ` +
  // O bit de cima (o número negativo) diz que a tecla está apertada agora.
  'while ([Wisp.Teclas]::GetAsyncKeyState($tecla) -lt 0 -and [DateTime]::UtcNow -lt $fim) { ' +
  `Start-Sleep -Milliseconds ${KEY_POLL_MS} }; ` +
  "[Console]::Out.WriteLine('solta') }"

/** Os códigos virtuais do Windows das teclas que não são letra, algarismo ou F1 a F24. */
const VIRTUAL_KEYS: Record<string, number> = {
  space: 0x20,
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  backspace: 0x08,
  escape: 0x1b,
  esc: 0x1b,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  insert: 0x2d,
  delete: 0x2e
}

/**
 * O código virtual do Windows da tecla de um acelerador do Electron (sem os modificadores); null
 * se não houver um que valha em todo teclado (a pontuação muda de lugar conforme o layout).
 */
export function acceleratorVirtualKey(accelerator: string): number | null {
  const key = accelerator.split('+').pop()?.trim().toLowerCase()
  if (!key) return null
  if (/^[a-z0-9]$/.test(key)) return key.toUpperCase().charCodeAt(0)
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(key)
  if (fn) return 0x70 + Number(fn[1]) - 1
  const num = /^num([0-9])$/.exec(key)
  if (num) return 0x60 + Number(num[1])
  return VIRTUAL_KEYS[key] ?? null
}

export interface KeyWatcherOptions {
  /** A tecla foi solta. */
  release(): void
  /** O script não abriu ou caiu: daqui em diante, o atalho não sabe mais quando a tecla é solta. */
  broken(): void
  /** Abre o script (os testes trocam por um de mentira). */
  spawn?: () => ChildProcessWithoutNullStreams
}

/** Acompanha uma tecla: `start` no aperto, e o `release` vem quando ela é solta. */
export class KeyWatcher {
  private child: ChildProcessWithoutNullStreams | null = null
  private watching = false
  private dead = false

  constructor(
    private readonly virtualKey: number,
    private readonly options: KeyWatcherOptions
  ) {}

  /** A tecla foi apertada. A repetição do teclado chama de novo enquanto ela fica presa. */
  start(): void {
    if (this.watching || this.dead) return
    const child = this.child ?? this.open()
    if (!child) return
    this.watching = true
    child.stdin.write(`${this.virtualKey}\n`)
  }

  /** Fecha o script (ao trocar de atalho ou ao fechar o app). */
  stop(): void {
    this.watching = false
    const child = this.child
    this.child = null
    if (!child) return
    child.stdin.end()
    child.kill()
  }

  private open(): ChildProcessWithoutNullStreams | null {
    let child: ChildProcessWithoutNullStreams
    try {
      child = (this.options.spawn ?? (() => startPowerShell(SCRIPT)))()
    } catch (err) {
      console.warn(`[wisp] atalho de voz: o PowerShell não abriu: ${(err as Error).message}`)
      this.fail()
      return null
    }
    this.child = child
    let pending = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() !== 'solta' || !this.watching) continue
        this.watching = false
        this.options.release()
      }
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      console.warn(`[wisp] atalho de voz: ${chunk.trim().split(/\r?\n/)[0]}`)
    })
    const gone = (): void => {
      if (this.child !== child) return
      this.child = null
      this.fail()
    }
    child.on('error', gone)
    child.on('exit', gone)
    child.stdin.on('error', () => undefined)
    return child
  }

  /** O script se foi sem ninguém fechar: a escuta em curso acaba, e o atalho volta ao toque. */
  private fail(): void {
    this.dead = true
    this.options.broken()
    if (!this.watching) return
    this.watching = false
    this.options.release()
  }
}

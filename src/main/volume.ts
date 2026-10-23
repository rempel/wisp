import { spawn } from 'child_process'
import { viaHost } from './host'

// O volume do sistema, para o "aumenta o volume" da voz: pelo wpctl (PipeWire) ou pelo pactl
// (PulseAudio, e o PipeWire com o pipewire-pulse). Sempre de 5 em 5%, até 100%.

const STEP = 5
const TIMEOUT_MS = 3000

function run(command: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const done = (code: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout })
    }
    const run = viaHost(command, args)
    const child = spawn(run.command, run.args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(-1)
    }, TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.on('error', () => done(-1))
    child.on('close', (code) => done(code ?? -1))
  })
}

/** O volume do "wpctl get-volume" ("Volume: 0.45 [MUTED]"), em %. */
export function parseWpctlVolume(stdout: string): number | null {
  const match = /Volume:\s*([\d.]+)/.exec(stdout)
  return match ? Math.round(Number(match[1]) * 100) : null
}

/** O volume do "pactl get-sink-volume" (o do primeiro canal), em %. */
export function parsePactlVolume(stdout: string): number | null {
  const match = /\/\s*(\d+)%/.exec(stdout)
  return match ? Number(match[1]) : null
}

/**
 * Sobe (1) ou desce (-1) o volume do sistema. Devolve o novo volume em %, ou null se não há
 * wpctl nem pactl que funcione (quem chamou tenta o volume do player).
 */
export async function stepSystemVolume(direction: 1 | -1): Promise<number | null> {
  const step = `${STEP}%${direction > 0 ? '+' : '-'}`
  const wp = await run('wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', step])
  if (wp.code === 0) {
    return parseWpctlVolume((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])).stdout)
  }
  // O "--" antes do comando: sem ele, o "-5%" viraria uma opção do pactl.
  const pa = await run('pactl', [
    '--',
    'set-sink-volume',
    '@DEFAULT_SINK@',
    `${direction > 0 ? '+' : '-'}${STEP}%`
  ])
  if (pa.code !== 0) return null
  let level = parsePactlVolume((await run('pactl', ['get-sink-volume', '@DEFAULT_SINK@'])).stdout)
  // O pactl passa de 100% sem limite; o Wisp para nos 100%.
  if (level !== null && level > 100) {
    await run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '100%'])
    level = 100
  }
  return level
}

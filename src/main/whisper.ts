import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { availableParallelism, homedir } from 'os'
import { basename, join } from 'path'
import { VOICE_RATE } from '../shared/vad'
import { expandHome } from './paths'
import { findProgram, isFile } from './programs'

// A transcrição local, com o whisper.cpp (o programa whisper-cli). O áudio vai pela entrada
// padrão, como um WAV montado na memória: nada de áudio no disco. Um whisper-cli antigo, que não
// lê da entrada padrão, recebe o WAV num arquivo em $XDG_RUNTIME_DIR (que fica na memória, não no
// disco), apagado assim que ele termina.

/** Opções que um whisper-cli antigo não conhece: sem elas, a transcrição sai do mesmo jeito. */
const OPTIONAL_FLAGS = ['-sns']
/** O que cada whisper-cli (pelo caminho) não aceita: opções e o stdin. Vale até o Wisp fechar. */
const quirks = new Map<string, { flags: Set<string>; noStdin: boolean }>()
/** Nomes do programa, do mais novo para o mais antigo, e onde o build do whisper.cpp o deixa. */
const NAMES = ['whisper-cli', 'whisper-cpp', 'whisper.cpp']
const BUILD_DIRS = ['~/whisper.cpp/build/bin', '~/.local/share/whisper.cpp/build/bin']

/** Por que a transcrição não saiu, em português. */
export class WhisperError extends Error {
  constructor(
    message: string,
    /** Falta instalar algo (o painel mostra como). */
    readonly setup = false
  ) {
    super(message)
  }
}

/** Um WAV (PCM de 16 bits, mono) com o áudio, na memória. */
export function wavFromPcm(pcm: Int16Array, rate = VOICE_RATE): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/**
 * O texto que o whisper-cli imprimiu, limpo: sem as marcas de trechos sem fala ([BLANK_AUDIO],
 * (música), [Risos]…), sem os créditos de legenda que o modelo inventa no silêncio (ele aprendeu
 * com legendas de vídeos) e com os espaços normalizados.
 */
export function cleanTranscript(stdout: string): string {
  return stdout
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/[^.!?\n]*\bamara\.org\b[^.!?\n]*[.!?]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** O whisper-cli: o do config (caminho ou nome no PATH) ou o primeiro achado. */
export function findWhisper(
  configured: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return findProgram(configured, NAMES, BUILD_DIRS, env)
}

export interface WhisperOptions {
  /** whisperPath do config. */
  binary: string
  /** whisperModel do config. */
  model: string
  /** Código do idioma ("pt") ou "auto". */
  language: string
}

/** Confere se dá para transcrever; devolve o programa e o modelo, ou lança o que falta. */
export function whisperSetup(options: WhisperOptions): { binary: string; model: string } {
  const binary = findWhisper(options.binary)
  if (!binary) {
    throw new WhisperError(
      'Para eu entender a sua voz, instale o whisper.cpp (o programa whisper-cli) ou diga onde ' +
        'ele está em whisperPath no config.json.',
      true
    )
  }
  const model = expandHome(options.model.trim())
  if (!isFile(model)) {
    throw new WhisperError(
      `Falta o modelo de voz do whisper.cpp: ${model.replace(homedir(), '~')}. O README ` +
        'explica como baixar.',
      true
    )
  }
  return { binary, model }
}

/**
 * Quanto esperar a transcrição (ms): 4 s por segundo de áudio, mais 10 s para carregar o modelo,
 * entre 30 s e 2 min. Um modelo que demora mais que isso é pesado demais para o computador.
 */
export function transcribeTimeout(seconds: number): number {
  return Math.round(Math.min(120, Math.max(30, 10 + seconds * 4)) * 1000)
}

/** A primeira linha de erro do whisper-cli ("error: …"), mesmo quando ele sai com 0. */
export function whisperError(stderr: string): string | null {
  const line = stderr.split('\n').find((l) => /^\s*error\b/i.test(l))
  return line ? line.trim() : null
}

/** O stderr no registro, sem o texto: só as linhas de erro, aviso e as do fim (no máximo 6). */
function logStderr(stderr: string, why: string): void {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const shown = [
    ...new Set([...lines.filter((l) => /error|fail|warn|unknown/i.test(l)), ...lines.slice(-3)])
  ].slice(0, 6)
  console.warn(`[wisp] whisper.cpp: ${why}${shown.length ? `\n  ${shown.join('\n  ')}` : ''}`)
}

interface Run {
  code: number | null
  stdout: string
  stderr: string
}

function run(
  binary: string,
  args: string[],
  input: Buffer | null,
  timeoutMs: number
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new WhisperError('timeout'))
    }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new WhisperError(`Não consegui rodar o whisper.cpp (${err.message}).`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    if (input && child.stdin) {
      // O processo pode sair antes de ler tudo (modelo inválido): o erro de escrita não importa.
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }
  })
}

/** O WAV num arquivo em $XDG_RUNTIME_DIR (na memória), para um whisper-cli que não lê o stdin. */
function runtimeWav(wav: Buffer): string {
  const runtime = process.env.XDG_RUNTIME_DIR
  if (!runtime) {
    throw new WhisperError(
      'Este whisper.cpp não lê o áudio pela entrada padrão. Atualize o whisper.cpp (a versão 1.5 ' +
        'ou mais nova lê).'
    )
  }
  const dir = join(runtime, 'wisp')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `voz-${randomBytes(6).toString('hex')}.wav`)
  writeFileSync(path, wav, { mode: 0o600 })
  return path
}

/** Transcreve o áudio (PCM de 16 bits a 16 kHz). Lança WhisperError com o motivo. */
export async function transcribe(pcm: Int16Array, options: WhisperOptions): Promise<string> {
  const { binary, model } = whisperSetup(options)
  const threads = String(Math.max(1, Math.min(8, availableParallelism())))
  const wav = wavFromPcm(pcm)
  const seconds = pcm.length / VOICE_RATE
  const timeoutMs = transcribeTimeout(seconds)
  const quirk = quirks.get(binary) ?? { flags: new Set<string>(), noStdin: false }
  quirks.set(binary, quirk)
  // Duas tentativas a mais, no máximo: sem uma opção que esta versão não conhece, e com o áudio
  // num arquivo, para a que não lê o stdin.
  for (let attempt = 0; attempt < 3; attempt++) {
    const flags = OPTIONAL_FLAGS.filter((flag) => !quirk.flags.has(flag))
    const file = quirk.noStdin ? runtimeWav(wav) : null
    const args = [
      '-m',
      model,
      '-l',
      options.language.trim() || 'pt',
      '-t',
      threads,
      '-nt',
      '-np',
      // -sns: sem os tokens de "não fala" (risadas, música), que o modelo inventa no silêncio.
      ...flags,
      '-f',
      file ?? '-'
    ]
    let result: Run
    try {
      result = await run(binary, args, file ? null : wav, timeoutMs)
    } catch (err) {
      if ((err as Error).message !== 'timeout') throw err
      console.warn(
        `[wisp] whisper.cpp: a transcrição de ${seconds.toFixed(1)} s de áudio passou de ` +
          `${timeoutMs / 1000} s (modelo ${basename(model)}, ${threads} threads)`
      )
      throw new WhisperError(
        `A transcrição passou de ${timeoutMs / 1000} s e eu desisti. O modelo ` +
          `${basename(model)} pode ser pesado demais para este computador: um menor, como o ` +
          'ggml-base ou o ggml-small, entende bem e responde em poucos segundos.'
      )
    } finally {
      if (file) {
        try {
          unlinkSync(file)
        } catch {
          // Já foi.
        }
      }
    }
    const { code, stdout, stderr } = result
    const error = whisperError(stderr)
    const unknown = /unknown argument:?\s*(\S+)/i.exec(stderr)?.[1]
    if (unknown && OPTIONAL_FLAGS.includes(unknown) && !quirk.flags.has(unknown)) {
      console.warn(`[wisp] whisper.cpp: esta versão não conhece ${unknown}; sigo sem ela`)
      quirk.flags.add(unknown)
      continue
    }
    if (!quirk.noStdin && !stdout.trim() && /failed to (?:read|open)[^\n]*'-'/i.test(stderr)) {
      console.warn('[wisp] whisper.cpp: esta versão não lê o stdin; sigo com um arquivo na memória')
      quirk.noStdin = true
      continue
    }
    if (code === 0 && !(error && !stdout.trim())) return cleanTranscript(stdout)
    logStderr(stderr, `saiu com ${code}`)
    const detail = error ?? stderr.trim().split('\n').pop() ?? ''
    throw new WhisperError(
      code === 0
        ? `O whisper.cpp não transcreveu: ${detail}.`
        : `O whisper.cpp saiu com erro (${code})${detail ? `: ${detail}` : ''}.`
    )
  }
  throw new WhisperError('O whisper.cpp recusou as opções que eu uso. Atualize o whisper.cpp.')
}

import { spawn } from 'child_process'
import { availableParallelism, homedir } from 'os'
import { VOICE_RATE } from '../shared/vad'
import { expandHome } from './paths'
import { findProgram, isFile } from './programs'

// A transcrição local, com o whisper.cpp (o programa whisper-cli). O áudio vai pela entrada
// padrão, como um WAV montado na memória: nada de áudio no disco.

const TIMEOUT_MS = 90_000
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

/** Transcreve o áudio (PCM de 16 bits a 16 kHz). Lança WhisperError com o motivo. */
export function transcribe(pcm: Int16Array, options: WhisperOptions): Promise<string> {
  const { binary, model } = whisperSetup(options)
  const threads = String(Math.max(1, Math.min(8, availableParallelism())))
  const args = [
    '-m',
    model,
    '-l',
    options.language.trim() || 'pt',
    '-t',
    threads,
    '-nt',
    '-np',
    // Sem os tokens de "não fala" (risadas, música), que o modelo inventa no silêncio.
    '-sns',
    '-f',
    '-'
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new WhisperError('A transcrição demorou demais.'))
    }, TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new WhisperError(`Não consegui rodar o whisper.cpp (${err.message}).`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(cleanTranscript(stdout))
      const detail = stderr.trim().split('\n').pop() ?? ''
      reject(
        new WhisperError(`O whisper.cpp saiu com erro (${code})${detail ? `: ${detail}` : ''}.`)
      )
    })
    // O processo pode sair antes de ler tudo (modelo inválido): o erro de escrita não importa.
    child.stdin.on('error', () => {})
    child.stdin.end(wavFromPcm(pcm))
  })
}

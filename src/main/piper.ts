import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { expandHome } from './paths'
import { findProgram, isFile } from './programs'

// A fala das respostas, com o Piper (TTS local). O texto vai pela entrada padrão e o áudio volta
// cru pela saída (PCM de 16 bits, mono, na taxa do modelo): nada passa pelo disco.

const TIMEOUT_MS = 60_000
/** Mais que isso de áudio (bytes), algo deu errado: 2 minutos a 22 kHz. */
const MAX_BYTES = 2 * 60 * 22_050 * 2

export interface PiperOptions {
  /** piperPath do config. */
  binary: string
  /** piperModel do config: o .onnx (o .onnx.json fica ao lado). */
  model: string
}

export interface Speech {
  pcm: Buffer
  rate: number
}

/** O piper e o modelo, ou o que falta (em português). */
export function piperSetup(options: PiperOptions): { binary: string; model: string } | string {
  const binary = findProgram(options.binary, ['piper', 'piper-tts'])
  if (!binary) {
    return (
      'Para eu falar as respostas, instale o Piper (o programa piper) ou diga onde ele está em ' +
      'piperPath no config.json.'
    )
  }
  const model = expandHome(options.model.trim())
  if (!model || !isFile(model)) {
    return `Falta a voz do Piper: ${model ? model.replace(homedir(), '~') : 'piperModel está vazio no config.json'}. O README explica como baixar.`
  }
  return { binary, model }
}

/** A taxa do modelo, no .onnx.json que vem com ele (22050 Hz na maioria das vozes). */
export function modelRate(model: string): number {
  try {
    const config = JSON.parse(readFileSync(`${model}.json`, 'utf8')) as {
      audio?: { sample_rate?: unknown }
    }
    const rate = config.audio?.sample_rate
    if (typeof rate === 'number' && rate >= 8000 && rate <= 48_000) return rate
  } catch {
    // Sem o arquivo de configuração: a taxa mais comum.
  }
  return 22_050
}

/** Fala o texto. Lança um Error com o motivo, em português. */
export function synthesize(text: string, options: PiperOptions): Promise<Speech> {
  const setup = piperSetup(options)
  if (typeof setup === 'string') return Promise.reject(new Error(setup))
  const rate = modelRate(setup.model)
  return new Promise((resolve, reject) => {
    const child = spawn(setup.binary, ['--model', setup.model, '--output-raw'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('o Piper demorou demais'))
    }, TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        child.kill('SIGKILL')
        return
      }
      chunks.push(chunk)
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`não consegui rodar o Piper (${err.message})`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve({ pcm: Buffer.concat(chunks), rate })
      const detail = stderr.trim().split('\n').pop() ?? ''
      reject(new Error(`o Piper saiu com erro (${code})${detail ? `: ${detail}` : ''}`))
    })
    child.stdin.on('error', () => {})
    // Uma linha só: o Piper fala cada linha da entrada como uma frase à parte.
    child.stdin.end(`${text.replace(/\s+/g, ' ').trim()}\n`)
  })
}

/**
 * O que falar de uma resposta: o texto sem o Markdown (blocos de código, links, marcas), e só o
 * começo das longas, que ficam para ler no painel.
 */
export function speakable(markdown: string, max = 280): string {
  const text = markdown
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  // As primeiras frases que cabem; o resto está no painel.
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text]
  let out = ''
  for (const sentence of sentences) {
    if ((out + sentence).length > max) break
    out += sentence
  }
  if (!out) out = `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
  return `${out.trim()} O resto está no painel.`
}

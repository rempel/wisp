// A busca por sentido da memória (Fase 80): um modelo de embeddings multilíngue pequeno (o
// multilingual-e5-small, quantizado, uns 120 MB) rodando dentro do Wisp, pelo ONNX Runtime em
// WebAssembly e o tokenizador em JS puro. É opcional: só é baixado com o seu clique, de
// huggingface.co, e depois tudo roda sem internet. Sem ele, a busca é só por texto.

import { createWriteStream, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { DATA_DIR } from './paths'

/** O modelo, de onde vem e os arquivos que o Wisp baixa dele. */
export const EMBEDDING_MODEL = {
  id: 'multilingual-e5-small',
  source: 'https://huggingface.co/Xenova/multilingual-e5-small',
  base: 'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/',
  files: { 'tokenizer.json': 'tokenizer.json', 'model.onnx': 'onnx/model_quantized.onnx' },
  /** O tamanho aproximado do download, para avisar antes. */
  approxBytes: 120_000_000
} as const

export const MODELS_DIR = join(DATA_DIR, 'modelos')
export const modelDir = (root = MODELS_DIR): string => join(root, EMBEDDING_MODEL.id)

/** Quantos tokens o modelo lê de cada texto (o resto é cortado). */
const MAX_TOKENS = 512

/** Transforma textos em vetores normalizados (o produto escalar é o cosseno). */
export interface Embedder {
  /** O nome do modelo: vetores de modelos diferentes não se comparam. */
  readonly name: string
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>
}

export interface ModelStatus {
  installed: boolean
  bytes: number
  /** Baixando agora: quanto já veio (0 a 1). */
  progress?: number
  error?: string
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return -1
  }
}

/** Os arquivos do modelo existem (o download termina com eles no lugar, nunca pela metade). */
export function modelInstalled(dir = modelDir()): boolean {
  return Object.keys(EMBEDDING_MODEL.files).every((name) => sizeOf(join(dir, name)) > 0)
}

let downloading: { progress: number } | null = null
let lastError: string | undefined

export function modelStatus(dir = modelDir()): ModelStatus {
  const installed = modelInstalled(dir)
  const bytes = installed
    ? Object.keys(EMBEDDING_MODEL.files).reduce((sum, name) => sum + sizeOf(join(dir, name)), 0)
    : 0
  return {
    installed,
    bytes,
    ...(downloading ? { progress: downloading.progress } : {}),
    ...(lastError && !installed ? { error: lastError } : {})
  }
}

/**
 * Baixa o modelo (com o seu clique). Cada arquivo vai para um temporário e só entra no lugar
 * inteiro; o modelo só conta como instalado com todos. `fetcher` troca o fetch nos testes.
 */
export async function downloadModel(
  dir = modelDir(),
  fetcher: typeof fetch = fetch
): Promise<ModelStatus> {
  if (downloading) return modelStatus(dir)
  downloading = { progress: 0 }
  lastError = undefined
  mkdirSync(dir, { recursive: true })
  const entries = Object.entries(EMBEDDING_MODEL.files)
  try {
    let done = 0
    for (const [name, remote] of entries) {
      const target = join(dir, name)
      const temp = `${target}.baixando`
      const res = await fetcher(EMBEDDING_MODEL.base + remote, { redirect: 'follow' })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} em ${remote}`)
      const total = Number(res.headers.get('content-length')) || EMBEDDING_MODEL.approxBytes
      let got = 0
      const body = Readable.fromWeb(res.body as never)
      body.on('data', (chunk: Buffer) => {
        got += chunk.length
        if (downloading) {
          downloading.progress = Math.min(0.99, (done + Math.min(1, got / total)) / entries.length)
        }
      })
      await pipeline(body, createWriteStream(temp, { mode: 0o644 }))
      renameSync(temp, target)
      done++
    }
    loaded = null
  } catch (err) {
    lastError = (err as Error).message
    for (const name of Object.keys(EMBEDDING_MODEL.files)) {
      rmSync(join(dir, `${name}.baixando`), { force: true })
    }
  } finally {
    downloading = null
  }
  return modelStatus(dir)
}

/** Tira o modelo do disco (a busca volta a ser só por texto). */
export function removeModel(dir = modelDir()): ModelStatus {
  rmSync(dir, { recursive: true, force: true })
  loaded = null
  return modelStatus(dir)
}

interface OrtTensor {
  data: Float32Array
  dims: readonly number[]
}
interface OrtSession {
  inputNames: readonly string[]
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>
}
interface Ort {
  env: { wasm: { numThreads: number } }
  Tensor: new (type: 'int64', data: BigInt64Array, dims: number[]) => unknown
  InferenceSession: { create(model: Uint8Array): Promise<OrtSession> }
}
interface Encoded {
  ids: number[]
  attention_mask: number[]
  token_type_ids?: number[]
}
interface TokenizerModule {
  Tokenizer: new (json: unknown, config: unknown) => { encode(text: string): Encoded }
}

/** A média dos vetores dos tokens (só os de verdade, pela máscara), normalizada. */
export function meanPool(hidden: OrtTensor, mask: number[]): Float32Array {
  const [, tokens, dims] = hidden.dims
  const out = new Float32Array(dims)
  let count = 0
  for (let t = 0; t < tokens; t++) {
    if (!mask[t]) continue
    count++
    for (let d = 0; d < dims; d++) out[d] += hidden.data[t * dims + d]
  }
  let norm = 0
  for (let d = 0; d < dims; d++) {
    out[d] /= Math.max(1, count)
    norm += out[d] * out[d]
  }
  norm = Math.sqrt(norm) || 1
  for (let d = 0; d < dims; d++) out[d] /= norm
  return out
}

/** Carrega o modelo de uma pasta: o tokenizador e a sessão do ONNX Runtime. */
export async function loadEmbedder(dir = modelDir()): Promise<Embedder> {
  // Carregados só aqui: sem o modelo, nada disso entra na memória do Wisp.
  const ort = (await import('onnxruntime-web')) as unknown as Ort
  const { Tokenizer } = (await import('@huggingface/tokenizers')) as unknown as TokenizerModule
  ort.env.wasm.numThreads = 1
  const tokenizer = new Tokenizer(JSON.parse(readFileSync(join(dir, 'tokenizer.json'), 'utf8')), {})
  const session = await ort.InferenceSession.create(readFileSync(join(dir, 'model.onnx')))
  const tensor = (values: number[]): unknown =>
    new ort.Tensor('int64', BigInt64Array.from(values.map(BigInt)), [1, values.length])
  return {
    name: EMBEDDING_MODEL.id,
    async embed(texts, kind) {
      const out: Float32Array[] = []
      for (const text of texts) {
        // O e5 pede o prefixo: "query: " na pergunta e "passage: " no que é buscado.
        const encoded = tokenizer.encode(`${kind}: ${text}`)
        const ids = encoded.ids.slice(0, MAX_TOKENS)
        const mask = encoded.attention_mask.slice(0, MAX_TOKENS)
        const feeds: Record<string, unknown> = {
          input_ids: tensor(ids),
          attention_mask: tensor(mask)
        }
        if (session.inputNames.includes('token_type_ids')) {
          feeds.token_type_ids = tensor(
            (encoded.token_type_ids ?? ids.map(() => 0)).slice(0, MAX_TOKENS)
          )
        }
        const result = await session.run(feeds)
        const hidden = result.last_hidden_state ?? Object.values(result)[0]
        out.push(meanPool(hidden, mask))
      }
      return out
    }
  }
}

let loaded: Promise<Embedder | null> | null = null

/** O modelo do Wisp, carregado uma vez (null: não foi baixado, ou não carregou). */
export function sharedEmbedder(dir = modelDir()): Promise<Embedder | null> {
  if (!modelInstalled(dir)) return Promise.resolve(null)
  loaded ??= loadEmbedder(dir).catch((err) => {
    console.warn('[wisp] o modelo da busca por sentido não carregou:', err)
    lastError = (err as Error).message
    return null
  })
  return loaded
}

// A busca no que o Wisp lembra (Fase 80), com o desenho do OpenClaw: os Markdown da memória e as
// conversas do histórico são a fonte da verdade, e um SQLite (o node:sqlite do Node do Electron,
// sem dependência nativa) é só o índice, refeito a partir deles. Cada fonte vira trechos de umas
// 200 palavras, com sobreposição; a busca soma a nota por texto (FTS5, BM25, sem acentos) e, com
// o modelo baixado, a por sentido (o cosseno dos vetores, calculado em JS): 70% sentido, 30%
// texto. Sem o modelo, só texto.
//
// Ficam de fora as conversas anônimas e as das pastas fora da memória (Fase 79).

import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { basename, dirname, join } from 'path'
import { getConfig } from './config'
import { sharedEmbedder } from './embeddings'
import type { Embedder } from './embeddings'
import { messagesOf } from './history-search'
import { History, HISTORY_DIR } from './history'
import type { SavedConversation } from './history'
import { CACHE_DIR } from './paths'
import { memoryAccess, MEMORY_DIR } from './personal-memory'
import { fold } from '../shared/fold'

/** Os trechos: quantas palavras e quantas se repetem do anterior. */
const CHUNK_WORDS = 200
const OVERLAP_WORDS = 40
/** Quantos candidatos cada lado (texto e sentido) traz antes de somar. */
const CANDIDATES = 50
/** Quantos trechos ganham vetor de cada vez, antes de deixar o resto do app andar. */
const EMBED_BATCH = 8
const VECTOR_WEIGHT = 0.7

export type MemorySource = 'memoria' | 'diario' | 'conversa'

export interface MemoryHit {
  source: MemorySource
  /** O arquivo (memória e diário) ou o título da conversa. */
  title: string
  /** Quando: o dia do diário, a data da conversa ou a da última mudança do arquivo. */
  at: number
  text: string
  score: number
  /** O id da conversa no histórico. */
  conversation?: string
}

export interface SearchOptions {
  source?: MemorySource
  /** Desde e até (ms Unix, inclusivo). */
  from?: number
  to?: number
  limit?: number
}

export interface IndexOptions {
  file: string
  memoryDir: string
  historyDir: string
  load: (id: string) => SavedConversation | null
  /** As pastas fora da memória, lidas a cada atualização. */
  excluded: () => string[]
  /** O gerador de vetores (null: sem o modelo, só texto). */
  embedder: () => Promise<Embedder | null>
}

interface Doc {
  id: string
  source: MemorySource
  path: string
  mtime: number
  size: number
}

/** Corta um texto em trechos de palavras, com sobreposição. */
export function chunksOf(text: string, words = CHUNK_WORDS, overlap = OVERLAP_WORDS): string[] {
  const all = text.split(/\s+/).filter(Boolean)
  if (!all.length) return []
  const out: string[] = []
  for (let start = 0; ; start += words - overlap) {
    out.push(all.slice(start, start + words).join(' '))
    if (start + words >= all.length) break
  }
  return out
}

/** A busca do FTS5: cada palavra entre aspas (e com * nas de 4 letras ou mais), juntas por OR. */
export function ftsQuery(query: string): string | null {
  const words = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
  if (!words.length) return null
  return [...new Set(words)]
    .map((word) => (word.length >= 4 ? `"${word}"*` : `"${word}"`))
    .join(' OR ')
}

const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < a.length && i < b.length; i++) sum += a[i] * b[i]
  return sum
}

const toBlob = (vector: Float32Array): Uint8Array =>
  new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
const fromBlob = (blob: Uint8Array): Float32Array =>
  new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))

const DAY = /^(\d{4})-(\d{2})-(\d{2})\.md$/

export class MemoryIndex {
  private db: DatabaseSync | null = null
  private embedding: Promise<void> | null = null

  constructor(private readonly options: IndexOptions) {}

  private open(): DatabaseSync {
    if (this.db) return this.db
    mkdirSync(dirname(this.options.file), { recursive: true })
    const db = new DatabaseSync(this.options.file)
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, mtime REAL, size INTEGER);
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY, doc TEXT, source TEXT, title TEXT, at INTEGER, text TEXT,
        conversation TEXT, vec BLOB
      );
      CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc);
      CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
        text, tokenize = 'unicode61 remove_diacritics 2'
      );
    `)
    this.db = db
    return db
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  /** As fontes de agora: a memória, o diário e as conversas que podem entrar. */
  private docs(): Doc[] {
    const out: Doc[] = []
    const add = (id: string, source: MemorySource, path: string): void => {
      try {
        const stat = statSync(path)
        out.push({ id, source, path, mtime: stat.mtimeMs, size: stat.size })
      } catch {
        // Sumiu: sai do índice.
      }
    }
    const { memoryDir, historyDir } = this.options
    add('memoria:EU.md', 'memoria', join(memoryDir, 'EU.md'))
    add('memoria:MEMORIA.md', 'memoria', join(memoryDir, 'MEMORIA.md'))
    for (const name of safeList(join(memoryDir, 'diario'))) {
      if (DAY.test(name)) add(`diario:${name}`, 'diario', join(memoryDir, 'diario', name))
    }
    for (const name of safeList(historyDir)) {
      if (name.endsWith('.jsonl')) {
        add(`conversa:${name.slice(0, -6)}`, 'conversa', join(historyDir, name))
      }
    }
    return out
  }

  /** Os trechos de uma fonte (vazio: ela não entra, como uma conversa anônima). */
  private chunksFor(
    doc: Doc,
    excluded: string[]
  ): { title: string; at: number; conversation?: string; texts: string[] } {
    if (doc.source === 'conversa') {
      const id = doc.id.slice('conversa:'.length)
      const saved = this.options.load(id)
      if (!saved || memoryAccess(!!saved.anonymous, saved.cwd ?? null, excluded) !== 'full') {
        return { title: '', at: 0, texts: [] }
      }
      const lines = messagesOf(saved.events).map(
        (message) => `${message.who === 'user' ? 'Usuário' : 'Claude'}: ${message.text}`
      )
      return {
        title: saved.title,
        at: saved.createdAt,
        conversation: id,
        texts: chunksOf(lines.join('\n'))
      }
    }
    let text: string
    try {
      text = readFileSync(doc.path, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    } catch {
      return { title: '', at: 0, texts: [] }
    }
    const day = DAY.exec(basename(doc.path))
    const at = day ? new Date(+day[1], +day[2] - 1, +day[3]).getTime() : doc.mtime
    // A memória é uma anotação por linha: trechos menores, para cada fato achar sozinho.
    const texts = doc.source === 'memoria' ? chunksOf(text, 60, 10) : chunksOf(text)
    return { title: basename(doc.path), at, texts }
  }

  /**
   * Confere o que mudou nas fontes e refaz só isso (o texto, na hora). Os vetores dos trechos
   * novos vêm depois, aos poucos, se o modelo estiver baixado.
   */
  refresh(): void {
    const db = this.open()
    const excluded = this.options.excluded()
    // As pastas excluídas mudaram: as conversas são conferidas de novo.
    const excludedKey = JSON.stringify(excluded)
    const sameExcluded =
      (db.prepare('SELECT value FROM meta WHERE key = ?').get('excluded') as { value?: string })
        ?.value === excludedKey
    const known = new Map(
      (db.prepare('SELECT id, mtime, size FROM docs').all() as unknown as Doc[]).map((doc) => [
        doc.id,
        doc
      ])
    )
    const current = this.docs()
    const seen = new Set<string>()
    db.exec('BEGIN')
    try {
      for (const doc of current) {
        seen.add(doc.id)
        const old = known.get(doc.id)
        const unchanged = old && old.mtime === doc.mtime && old.size === doc.size
        if (unchanged && (sameExcluded || doc.source !== 'conversa')) continue
        this.remove(db, doc.id)
        const { title, at, conversation, texts } = this.chunksFor(doc, excluded)
        const insert = db.prepare(
          'INSERT INTO chunks (doc, source, title, at, text, conversation) VALUES (?, ?, ?, ?, ?, ?)'
        )
        const fts = db.prepare('INSERT INTO fts (rowid, text) VALUES (?, ?)')
        for (const text of texts) {
          const row = insert.run(
            doc.id,
            doc.source,
            title,
            Math.round(at),
            text,
            conversation ?? null
          )
          fts.run(Number(row.lastInsertRowid), `${title}\n${text}`)
        }
        db.prepare('INSERT OR REPLACE INTO docs (id, mtime, size) VALUES (?, ?, ?)').run(
          doc.id,
          doc.mtime,
          doc.size
        )
      }
      for (const id of known.keys()) if (!seen.has(id)) this.remove(db, id)
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'excluded',
        excludedKey
      )
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  private remove(db: DatabaseSync, doc: string): void {
    const ids = db.prepare('SELECT id FROM chunks WHERE doc = ?').all(doc) as { id: number }[]
    const fts = db.prepare('DELETE FROM fts WHERE rowid = ?')
    for (const { id } of ids) fts.run(id)
    db.prepare('DELETE FROM chunks WHERE doc = ?').run(doc)
    db.prepare('DELETE FROM docs WHERE id = ?').run(doc)
  }

  /**
   * Dá vetor aos trechos que ainda não têm (de oito em oito, deixando o app andar entre eles).
   * Trocar de modelo apaga os vetores velhos. Um só por vez.
   */
  embedPending(): Promise<void> {
    this.embedding ??= this.runEmbedding().finally(() => {
      this.embedding = null
    })
    return this.embedding
  }

  private async runEmbedding(): Promise<void> {
    const embedder = await this.options.embedder()
    if (!embedder) return
    const db = this.open()
    const model = (
      db.prepare('SELECT value FROM meta WHERE key = ?').get('model') as {
        value?: string
      }
    )?.value
    if (model !== embedder.name) {
      db.exec('UPDATE chunks SET vec = NULL')
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'model',
        embedder.name
      )
    }
    const pending = db.prepare(
      `SELECT id, title, text FROM chunks WHERE vec IS NULL LIMIT ${EMBED_BATCH}`
    )
    const save = db.prepare('UPDATE chunks SET vec = ? WHERE id = ?')
    for (;;) {
      if (!this.db) return
      const rows = pending.all() as { id: number; title: string; text: string }[]
      if (!rows.length) return
      const vectors = await embedder.embed(
        rows.map((row) => `${row.title}\n${row.text}`),
        'passage'
      )
      if (!this.db) return
      rows.forEach((row, i) => save.run(toBlob(vectors[i]), row.id))
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  /** Quantos trechos há, e quantos já têm vetor. */
  stats(): { chunks: number; vectors: number } {
    const db = this.open()
    const row = db
      .prepare('SELECT COUNT(*) AS chunks, COUNT(vec) AS vectors FROM chunks')
      .get() as { chunks: number; vectors: number }
    return { chunks: Number(row.chunks), vectors: Number(row.vectors) }
  }

  /** Busca por texto e, com o modelo, por sentido; as duas notas somadas. */
  async search(query: string, options: SearchOptions = {}): Promise<MemoryHit[]> {
    this.refresh()
    const db = this.open()
    const limit = Math.min(20, Math.max(1, options.limit ?? 8))
    const filters: string[] = []
    const values: (string | number)[] = []
    if (options.source) {
      filters.push('c.source = ?')
      values.push(options.source)
    }
    if (options.from !== undefined) {
      filters.push('c.at >= ?')
      values.push(options.from)
    }
    if (options.to !== undefined) {
      filters.push('c.at <= ?')
      values.push(options.to)
    }
    const where = filters.length ? `AND ${filters.join(' AND ')}` : ''
    const scores = new Map<number, { text: number; vector: number }>()

    const match = ftsQuery(query)
    if (match) {
      const rows = db
        .prepare(
          `SELECT c.id AS id, bm25(fts) AS rank FROM fts JOIN chunks c ON c.id = fts.rowid
           WHERE fts MATCH ? ${where} ORDER BY rank LIMIT ${CANDIDATES}`
        )
        .all(match, ...values) as { id: number; rank: number }[]
      const best = Math.max(...rows.map((row) => -row.rank), 1e-9)
      for (const row of rows) scores.set(row.id, { text: -row.rank / best, vector: 0 })
    }

    const embedder = await this.options.embedder()
    let semantic = false
    if (embedder) {
      void this.embedPending()
      const [wanted] = await embedder.embed([query], 'query')
      const rows = db
        .prepare(`SELECT c.id AS id, c.vec AS vec FROM chunks c WHERE c.vec IS NOT NULL ${where}`)
        .all(...values) as { id: number; vec: Uint8Array }[]
      semantic = rows.length > 0
      const ranked = rows
        .map((row) => ({ id: row.id, score: dot(wanted, fromBlob(row.vec)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, CANDIDATES)
      for (const { id, score } of ranked) {
        const entry = scores.get(id) ?? { text: 0, vector: 0 }
        entry.vector = Math.max(0, score)
        scores.set(id, entry)
      }
    }

    const total = (entry: { text: number; vector: number }): number =>
      semantic ? VECTOR_WEIGHT * entry.vector + (1 - VECTOR_WEIGHT) * entry.text : entry.text
    const top = [...scores.entries()]
      .map(([id, entry]) => ({ id, score: total(entry) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    const get = db.prepare('SELECT source, title, at, text, conversation FROM chunks WHERE id = ?')
    return top.map(({ id, score }) => {
      const row = get.get(id) as {
        source: MemorySource
        title: string
        at: number
        text: string
        conversation: string | null
      }
      return {
        source: row.source,
        title: row.title,
        at: Number(row.at),
        text: row.text,
        score: Math.round(score * 1000) / 1000,
        ...(row.conversation ? { conversation: row.conversation } : {})
      }
    })
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

let shared: MemoryIndex | null = null
/** O índice do app: em memoria.sqlite, no cache (apagar só o faz ser refeito). */
export function memoryIndex(): MemoryIndex {
  if (!shared) {
    const history = new History()
    shared = new MemoryIndex({
      file: join(CACHE_DIR, 'memoria.sqlite'),
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      load: (id) => history.load(id),
      excluded: () => getConfig().memoryExcludedFolders,
      embedder: () => sharedEmbedder()
    })
  }
  return shared
}

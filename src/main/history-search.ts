// A busca do histórico (Fase 29): um índice local do que foi dito em cada conversa (as suas
// mensagens e as respostas do Claude, com as edições já aplicadas), num cache em ~/.cache/wisp.
// Cada busca confere o que mudou na pasta das conversas e só relê esses arquivos. O índice fica
// na memória enquanto o histórico é usado e sai dela alguns minutos depois; apagar uma conversa
// a tira do cache na hora.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { applyRewinds, HISTORY_DIR } from './history'
import type { History } from './history'
import { CACHE_DIR } from './paths'
import type { ChatEvent, ConversationSummary, HistoryHit, HistoryTarget } from '../shared/ipc'
import { fold, foldMap, queryWords } from '../shared/fold'

export const SEARCH_FILE = join(CACHE_DIR, 'busca.json')
/** Quanto o índice fica na memória depois da última busca. */
const KEEP_MS = 5 * 60_000
/** Quanto esperar outras mudanças antes de regravar o cache. */
const SAVE_MS = 10_000
/** O trecho: quantos caracteres antes e depois do que bate. */
const BEFORE = 50
const AFTER = 110

/** Uma mensagem que dá para achar: sua (a n-ésima) ou um bloco de texto do Claude (pelo id). */
export interface IndexedMessage {
  who: 'user' | 'claude'
  ref: number | string
  text: string
}

interface Entry {
  mtime: number
  size: number
  messages: IndexedMessage[]
}

/** No disco: [quem ("u" ou "c"), a referência, o texto]. */
type StoredMessage = ['u', number, string] | ['c', string, string]

interface Stored {
  v: 1
  conversas: Record<string, { mtime: number; size: number; mensagens: StoredMessage[] }>
}

/** O que dá para buscar numa conversa: as mensagens suas e os textos do Claude, já editados. */
export function messagesOf(events: ChatEvent[]): IndexedMessage[] {
  const out: IndexedMessage[] = []
  // Cada mensagem sua vira uma na conversa (a página as conta igual, para abrir na certa).
  let users = 0
  for (const event of applyRewinds(events)) {
    if (event.type === 'user') {
      if (event.text.trim()) out.push({ who: 'user', ref: users, text: event.text })
      users++
    } else if (event.type === 'text' && event.delta.trim()) {
      out.push({ who: 'claude', ref: event.blockId, text: event.delta })
    }
  }
  return out
}

/** Sem a marcação do Markdown que atrapalha a leitura de um trecho. */
const plain = (text: string): string => text.replace(/\*\*|__|`+|^#+ /g, '')

/**
 * O trecho de uma mensagem em volta do que bate (a frase inteira, ou a primeira palavra que
 * aparece), cortado nas palavras; null se nada bate.
 */
export function snippetOf(
  message: IndexedMessage,
  words: string[]
): { before: string; match: string; after: string } | null {
  const text = message.text.replace(/\s+/g, ' ').trim()
  const { folded, at } = foldMap(text)
  const phrase = words.join(' ')
  let start = folded.indexOf(phrase)
  let length = phrase.length
  for (let i = 0; start < 0 && i < words.length; i++) {
    start = folded.indexOf(words[i])
    length = words[i].length
  }
  if (start < 0) return null
  const from = at[start]
  const to = at[start + length]
  let before = text.slice(Math.max(0, from - BEFORE), from)
  let after = text.slice(to, to + AFTER)
  // Cortado no meio de uma palavra: ela sai, e as reticências avisam.
  if (from > BEFORE) before = '…' + before.replace(/^\S*\s/, '')
  if (to + AFTER < text.length) after = after.replace(/\s\S*$/, '') + '…'
  return { before: plain(before), match: text.slice(from, to), after: plain(after) }
}

export class SearchIndex {
  /** null: fora da memória (lido do cache na próxima busca). */
  private entries: Map<string, Entry> | null = null
  /** O texto dobrado de cada mensagem, só na memória. */
  private readonly folded = new Map<string, string[]>()
  private saveTimer: NodeJS.Timeout | null = null
  private dropTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: Pick<History, 'load'>,
    private readonly dir = HISTORY_DIR,
    private readonly file = SEARCH_FILE
  ) {}

  /**
   * As conversas (de `summaries`, já na ordem da lista) em que cada palavra da busca aparece no
   * título ou no que foi dito, com o trecho da mensagem que mais bate.
   */
  search(query: string, summaries: ConversationSummary[]): HistoryHit[] {
    const words = queryWords(query)
    if (!words.length) return []
    const entries = this.refresh(summaries)
    const phrase = words.join(' ')
    const hits: HistoryHit[] = []
    for (const summary of summaries) {
      const entry = entries.get(summary.id)
      const title = fold(summary.title)
      const texts = entry ? this.foldedOf(summary.id, entry) : []
      if (!words.every((word) => title.includes(word) || texts.some((t) => t.includes(word)))) {
        continue
      }
      // A melhor mensagem: a que tem a frase inteira; senão, a que tem mais palavras (a primeira).
      let best = -1
      let bestScore = 0
      let matches = 0
      texts.forEach((text, index) => {
        const score = text.includes(phrase)
          ? words.length + 1
          : words.filter((word) => text.includes(word)).length
        if (score > 0) matches++
        if (score > bestScore) {
          best = index
          bestScore = score
        }
      })
      const message = entry && best >= 0 ? entry.messages[best] : null
      const snippet = message ? snippetOf(message, words) : null
      hits.push({
        ...summary,
        matches,
        snippet: message && snippet ? { who: message.who, ...snippet } : null,
        ...(message && snippet ? { at: targetOf(message, snippet.match) } : {})
      })
    }
    return hits
  }

  /** Tira uma conversa apagada do índice e do cache, na hora. */
  forget(id: string): void {
    const entries = this.load()
    this.folded.delete(id)
    if (!entries.delete(id)) return
    this.save()
    this.scheduleDrop()
  }

  /** Grava o que faltava e solta os temporizadores (o app está fechando). */
  dispose(): void {
    if (this.saveTimer) this.save()
    if (this.dropTimer) clearTimeout(this.dropTimer)
    this.dropTimer = null
  }

  /** Confere cada conversa da lista: as novas ou mudadas são relidas; as apagadas saem. */
  private refresh(summaries: ConversationSummary[]): Map<string, Entry> {
    const entries = this.load()
    const seen = new Set<string>()
    let changed = false
    for (const { id } of summaries) {
      seen.add(id)
      let stat: { mtimeMs: number; size: number }
      try {
        stat = statSync(join(this.dir, `${id}.jsonl`))
      } catch {
        continue
      }
      const old = entries.get(id)
      if (old && old.mtime === stat.mtimeMs && old.size === stat.size) continue
      const saved = this.store.load(id)
      if (!saved) continue
      entries.set(id, { mtime: stat.mtimeMs, size: stat.size, messages: messagesOf(saved.events) })
      this.folded.delete(id)
      changed = true
    }
    // As que não vieram na lista e não têm mais arquivo (apagadas fora do Wisp) saem.
    for (const id of [...entries.keys()]) {
      if (seen.has(id) || existsSync(join(this.dir, `${id}.jsonl`))) continue
      entries.delete(id)
      this.folded.delete(id)
      changed = true
    }
    if (changed) this.scheduleSave()
    this.scheduleDrop()
    return entries
  }

  private foldedOf(id: string, entry: Entry): string[] {
    let texts = this.folded.get(id)
    if (!texts) {
      texts = entry.messages.map((message) => fold(message.text.replace(/\s+/g, ' ')))
      this.folded.set(id, texts)
    }
    return texts
  }

  /** O índice na memória, lido do cache se preciso (um cache estragado é refeito). */
  private load(): Map<string, Entry> {
    if (this.entries) return this.entries
    const entries = new Map<string, Entry>()
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as Stored
      if (stored.v === 1 && stored.conversas && typeof stored.conversas === 'object') {
        for (const [id, value] of Object.entries(stored.conversas)) {
          if (typeof value?.mtime !== 'number' || typeof value.size !== 'number') continue
          if (!Array.isArray(value.mensagens)) continue
          const messages: IndexedMessage[] = []
          for (const item of value.mensagens) {
            if (!Array.isArray(item) || typeof item[2] !== 'string') continue
            if (item[0] === 'u' && typeof item[1] === 'number') {
              messages.push({ who: 'user', ref: item[1], text: item[2] })
            } else if (item[0] === 'c' && typeof item[1] === 'string') {
              messages.push({ who: 'claude', ref: item[1], text: item[2] })
            }
          }
          entries.set(id, { mtime: value.mtime, size: value.size, messages })
        }
      }
    } catch {
      // Sem cache (ou estragado): o índice é refeito pelas conversas.
    }
    this.entries = entries
    return entries
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), SAVE_MS)
    this.saveTimer.unref()
  }

  /** Grava o cache: só o usuário lê (ele tem o que foi dito nas conversas). */
  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (!this.entries) return
    const stored: Stored = { v: 1, conversas: {} }
    for (const [id, entry] of this.entries) {
      stored.conversas[id] = {
        mtime: entry.mtime,
        size: entry.size,
        mensagens: entry.messages.map(({ who, ref, text }) =>
          who === 'user' ? ['u', ref as number, text] : ['c', ref as string, text]
        )
      }
    }
    try {
      mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 })
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify(stored), { mode: 0o600 })
      renameSync(temp, this.file)
    } catch (err) {
      console.warn('[wisp] não consegui guardar o índice da busca:', (err as Error).message)
    }
  }

  /** Alguns minutos sem buscar: o índice sai da memória (fica no cache). */
  private scheduleDrop(): void {
    if (this.dropTimer) clearTimeout(this.dropTimer)
    this.dropTimer = setTimeout(() => {
      this.dropTimer = null
      if (this.saveTimer) this.save()
      this.entries = null
      this.folded.clear()
    }, KEEP_MS)
    this.dropTimer.unref()
  }
}

/** Uma mensagem para abrir vinda da página (a busca do histórico), conferida; null se não vale. */
export function checkTarget(value: unknown): HistoryTarget | null {
  if (!value || typeof value !== 'object') return null
  const at = value as Record<string, unknown>
  if (typeof at.term !== 'string' || !at.term.trim() || at.term.length > 300) return null
  const term = at.term
  if (at.kind === 'user' && Number.isSafeInteger(at.n) && (at.n as number) >= 0) {
    return { kind: 'user', n: at.n as number, term }
  }
  if (at.kind === 'text' && typeof at.id === 'string' && at.id && at.id.length <= 200) {
    return { kind: 'text', id: at.id, term }
  }
  return null
}

/** Onde abrir a conversa achada: a mensagem do trecho, marcando o que bateu. */
function targetOf(message: IndexedMessage, term: string): HistoryTarget {
  return message.who === 'user'
    ? { kind: 'user', n: message.ref as number, term }
    : { kind: 'text', id: message.ref as string, term }
}

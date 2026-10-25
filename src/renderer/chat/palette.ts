// A paleta de comandos (Fase 32): uma busca só para as abas, as ações do Wisp, os prompts
// salvos, as tarefas, as sessões do terminal, os projetos e as conversas. Aqui fica o que acha e
// ordena (sem diferenciar maiúsculas nem acentos, como o histórico); a tela é o
// CommandPalette.tsx, e as ações, o palette-actions.ts.

import { fold, queryWords } from '../../shared/fold'

export type PaletteGroup =
  'tab' | 'action' | 'prompt' | 'task' | 'session' | 'folder' | 'conversation' | 'found'

export interface PaletteItem {
  id: string
  group: PaletteGroup
  title: string
  /** Uma linha a mais, apagada (o trecho achado, o texto do prompt...). */
  detail?: string
  /** O atalho da ação, para aprender. */
  shortcut?: string
  /** Outras palavras que acham o item, sem aparecer. */
  keywords?: string
  /** O que a ação já é (o modo de agora): aparece marcado. */
  current?: boolean
  run(): void
}

/** A ordem dos grupos, sem busca e no empate. */
export const GROUP_ORDER: PaletteGroup[] = [
  'tab',
  'action',
  'prompt',
  'task',
  'session',
  'conversation',
  'folder',
  'found'
]

/** Sem busca, quantos de cada grupo aparecem (os outros, todos). */
const IDLE_LIMIT: Partial<Record<PaletteGroup, number>> = { conversation: 8, folder: 0, found: 0 }

/** Quantos itens a lista mostra, no máximo. */
export const MAX_RESULTS = 50

/** As palavras de um título, para o "começa com". */
const startsOfWords = (text: string): string[] => text.split(/[\s/:·.,()–-]+/).filter(Boolean)

/** Quanto o item combina com a busca (maior, melhor); null se falta alguma palavra. */
export function scoreItem(item: PaletteItem, words: string[]): number | null {
  const title = fold(item.title)
  const all = `${title} ${fold(item.detail ?? '')} ${fold(item.keywords ?? '')}`
  if (!words.every((word) => all.includes(word))) return null
  let score = 0
  for (const word of words) {
    if (title.startsWith(word)) score += 4
    else if (startsOfWords(title).some((part) => part.startsWith(word))) score += 3
    else if (title.includes(word)) score += 2
    else if (fold(item.keywords ?? '').includes(word)) score += 1
  }
  return score
}

/**
 * O que a lista mostra: sem busca, os grupos na ordem (as conversas mais recentes, sem os
 * projetos); com busca, os que têm todas as palavras, os que mais combinam primeiro.
 */
export function rankPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const order = (group: PaletteGroup): number => GROUP_ORDER.indexOf(group)
  const words = queryWords(query)
  if (!words.length) {
    return GROUP_ORDER.flatMap((group) => {
      const list = items.filter((item) => item.group === group)
      return list.slice(0, IDLE_LIMIT[group] ?? list.length)
    }).slice(0, MAX_RESULTS)
  }
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, words) }))
    .filter((entry): entry is { item: PaletteItem; index: number; score: number } => {
      return entry.score !== null
    })
    .sort(
      (a, b) => b.score - a.score || order(a.item.group) - order(b.item.group) || a.index - b.index
    )
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.item)
}

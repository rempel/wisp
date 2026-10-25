// Buscar sem diferenciar maiúsculas nem acentos (Fase 29): "acao" acha "Ação". O histórico, a
// busca na conversa (Ctrl+F) e o título das conversas usam o mesmo jeito.

/** Uma letra sem o acento e em minúscula (pode virar mais de uma, ou nenhuma). */
const foldChar = (char: string): string =>
  char
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** O texto sem acentos e em minúsculas (de uma vez: rápido, para os textos longos). */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * O texto dobrado e, para cada posição dele, a posição no original (com uma a mais no fim), para
 * marcar no texto original o trecho achado no dobrado.
 */
export function foldMap(text: string): { folded: string; at: number[] } {
  let folded = ''
  const at: number[] = []
  let index = 0
  for (const char of text) {
    const piece = foldChar(char)
    folded += piece
    for (let i = 0; i < piece.length; i++) at.push(index)
    index += char.length
  }
  at.push(index)
  return { folded, at }
}

/** As palavras de uma busca, já dobradas. */
export const queryWords = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean)

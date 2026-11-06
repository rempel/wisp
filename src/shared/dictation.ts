// As trocas do ditado (Fase 53): "dito → escrito", aplicadas antes de colar. Aqui, para o
// painel (que as edita uma por linha) e o main (que as aplica) lerem igual.

/** Uma troca: o que o whisper escreve e o que você quer (um nome, um termo). */
export interface Replacement {
  from: string
  to: string
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Aplica as trocas, como palavras inteiras e sem ligar para maiúsculas. */
export function applyReplacements(text: string, replacements: Replacement[]): string {
  let out = text
  for (const { from, to } of replacements) {
    const word = from.trim()
    if (!word) continue
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'), to)
  }
  return out.trim()
}

/** As trocas escritas uma por linha ("dito = escrito"), como nas configurações. */
export function parseReplacements(lines: string): Replacement[] {
  return lines
    .split('\n')
    .map((line) => /^(.+?)\s*(?:=|→|->)\s*(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => !!match && !!match[1].trim())
    .slice(0, 100)
    .map((match) => ({ from: match[1].trim().slice(0, 100), to: match[2].trim().slice(0, 200) }))
}

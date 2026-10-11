// As gravações do modo demonstração (resources/demo): qual responde a qual mensagem.

export interface Recording {
  /** O arquivo JSONL, em resources/demo. */
  file: string
  /** Palavras (sem acento, minúsculas) que escolhem esta gravação. */
  keywords: string[]
}

export interface RecordingIndex {
  /** A gravação de quando nenhuma palavra bate (a de ajuda). */
  fallback: string
  recordings: Recording[]
}

/** Minúsculas e sem acentos: "Previsão" e "previsao" valem igual. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** A gravação para uma mensagem: a primeira com uma das palavras dela, ou a de ajuda. */
export function pickRecording(text: string, index: RecordingIndex): string {
  const words = fold(text)
  return (
    index.recordings.find((item) => item.keywords.some((word) => words.includes(word)))?.file ??
    index.fallback
  )
}

import type { DiffHunk, FileDiff } from './ipc'

/** Quantas linhas de diff vão para a tela; as contagens +N −M valem para o diff inteiro. */
const MAX_LINES = 400
const MAX_LINE_CHARS = 300
/**
 * Acima disso (linhas antigas × novas), o diff linha a linha fica caro demais para o chat; ele
 * vira "tudo saiu, tudo entrou".
 */
const MAX_CELLS = 250_000

function clipLine(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line
}

/** As linhas de um texto, sem a vazia que sobra depois do último \n. */
function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Conta as linhas que entraram e saíram e corta os trechos no limite de linhas. */
export function buildDiff(hunks: DiffHunk[]): FileDiff {
  let added = 0
  let removed = 0
  let budget = MAX_LINES
  let truncated = false
  const kept: DiffHunk[] = []
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
    if (budget <= 0) {
      truncated = true
      continue
    }
    const lines = hunk.lines.slice(0, budget).map(clipLine)
    if (lines.length < hunk.lines.length) truncated = true
    budget -= lines.length
    kept.push({ ...hunk, lines })
  }
  return { added, removed, hunks: kept, truncated }
}

/**
 * Diff linha a linha entre dois textos, pela maior subsequência comum, num trecho só. Serve
 * para os trechos curtos de um Edit; sem o número da linha no arquivo, o trecho começa em 0.
 */
export function lineDiff(before: string, after: string): DiffHunk {
  const a = splitLines(before)
  const b = splitLines(after)
  const hunk = (lines: string[]): DiffHunk => ({ oldStart: 0, newStart: 0, lines })
  if (a.length * b.length > MAX_CELLS) {
    return hunk([...a.map((line) => `-${line}`), ...b.map((line) => `+${line}`)])
  }
  // common[i][j]: tamanho da maior subsequência comum de a[i..] e b[j..].
  const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] =
        a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
    }
  }
  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]}`)
      i++
      j++
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      lines.push(`-${a[i++]}`)
    } else {
      lines.push(`+${b[j++]}`)
    }
  }
  while (i < a.length) lines.push(`-${a[i++]}`)
  while (j < b.length) lines.push(`+${b[j++]}`)
  return hunk(lines)
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * O diff que dá para prever pelos argumentos da chamada, antes do resultado: Edit e MultiEdit
 * pelo trecho trocado, Write pelo conteúdo novo (sem saber o que o arquivo tinha antes).
 */
export function diffFromInput(toolName: string, input: unknown): FileDiff | null {
  const fields = (input ?? {}) as Record<string, unknown>
  switch (toolName) {
    case 'Edit':
      return buildDiff([lineDiff(str(fields.old_string), str(fields.new_string))])
    case 'MultiEdit': {
      if (!Array.isArray(fields.edits)) return null
      return buildDiff(
        fields.edits.map((edit: Record<string, unknown> | null) =>
          lineDiff(str(edit?.old_string), str(edit?.new_string))
        )
      )
    }
    case 'Write':
      return buildDiff([lineDiff('', str(fields.content))])
    default:
      return null
  }
}

/**
 * O diff real de uma edição, a partir do `tool_use_result` que o Claude Code manda junto com o
 * resultado (o `structuredPatch` do Edit e do Write). null se o formato não for o esperado.
 */
export function diffFromResult(result: unknown): FileDiff | null {
  if (!result || typeof result !== 'object') return null
  const fields = result as Record<string, unknown>
  const patch = fields.structuredPatch
  if (!Array.isArray(patch)) return null
  // Arquivo novo: o patch vem vazio e o conteúdo inteiro entrou.
  if (patch.length === 0 && fields.type === 'create' && typeof fields.content === 'string') {
    return buildDiff([{ ...lineDiff('', fields.content), oldStart: 0, newStart: 1 }])
  }
  const hunks: DiffHunk[] = []
  for (const item of patch) {
    const hunk = (item ?? {}) as Record<string, unknown>
    const { oldStart, newStart, lines } = hunk
    if (
      typeof oldStart !== 'number' ||
      typeof newStart !== 'number' ||
      !Array.isArray(lines) ||
      !lines.every((line) => typeof line === 'string')
    ) {
      return null
    }
    hunks.push({ oldStart, newStart, lines })
  }
  return buildDiff(hunks)
}

/**
 * Quebra um trecho com todas as linhas (como o de lineDiff) em trechos menores em volta das
 * mudanças, com `context` linhas iguais antes e depois e os números das linhas. Serve para
 * mostrar a mudança num arquivo grande.
 */
export function compactHunks(hunk: DiffHunk, context = 3): DiffHunk[] {
  const lines = hunk.lines
  const changed = lines.map((line) => !line.startsWith(' '))
  const keep = lines.map((_, i) => {
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      if (changed[j]) return true
    }
    return false
  })
  const hunks: DiffHunk[] = []
  let oldLine = Math.max(1, hunk.oldStart)
  let newLine = Math.max(1, hunk.newStart)
  let current: DiffHunk | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (keep[i]) {
      current ??= { oldStart: oldLine, newStart: newLine, lines: [] }
      current.lines.push(line)
    } else if (current) {
      hunks.push(current)
      current = null
    }
    if (!line.startsWith('+')) oldLine++
    if (!line.startsWith('-')) newLine++
  }
  if (current) hunks.push(current)
  return hunks
}

/** Os dois lados de um diff para o editor do VS Code (Fase 34). */
export interface DiffSides {
  /** O texto de antes e o de depois, os trechos um depois do outro. */
  original: string
  modified: string
  /** O número no arquivo de cada linha do editor (0 quando não se sabe). */
  originalLines: number[]
  modifiedLines: number[]
  /** Depois de quantas linhas de cada lado começa cada trecho (menos o primeiro). */
  breaks: { original: number; modified: number }[]
}

/**
 * Os trechos de um diff como os dois textos que o editor compara: o de antes (o contexto e o que
 * saiu) e o de depois (o contexto e o que entrou), com o número de cada linha no arquivo.
 */
export function diffSides(diff: FileDiff): DiffSides {
  const original: string[] = []
  const modified: string[] = []
  const originalLines: number[] = []
  const modifiedLines: number[] = []
  const breaks: DiffSides['breaks'] = []
  diff.hunks.forEach((hunk, index) => {
    if (index > 0) breaks.push({ original: original.length, modified: modified.length })
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const line of hunk.lines) {
      // "\ No newline at end of file" não é uma linha do arquivo.
      if (line.startsWith('\\')) continue
      const text = line.slice(1)
      if (!line.startsWith('+')) {
        original.push(text)
        originalLines.push(oldLine > 0 ? oldLine++ : 0)
      }
      if (!line.startsWith('-')) {
        modified.push(text)
        modifiedLines.push(newLine > 0 ? newLine++ : 0)
      }
    }
  })
  return {
    original: original.join('\n'),
    modified: modified.join('\n'),
    originalLines,
    modifiedLines,
    breaks
  }
}

/** O arquivo de uma chamada de ferramenta (o `file_path` do Read, Edit e Write); '' se não há. */
export function pathOf(input: unknown): string {
  const fields = (input ?? {}) as Record<string, unknown>
  const path = fields.file_path ?? fields.notebook_path
  return typeof path === 'string' ? path : ''
}

/** As linhas do arquivo que a edição pôs (as que entraram), quando os números são conhecidos. */
export function changedLines(diff: FileDiff): number[] {
  const lines: number[] = []
  for (const hunk of diff.hunks) {
    if (hunk.newStart <= 0) continue
    let line = hunk.newStart
    for (const text of hunk.lines) {
      if (text.startsWith('\\') || text.startsWith('-')) continue
      if (text.startsWith('+')) lines.push(line)
      line++
    }
  }
  return lines
}

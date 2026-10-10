/**
 * Perguntas do Claude (ferramenta AskUserQuestion). No modo headless elas chegam ao `approve`
 * como um pedido de permissão; responder é liberar a ferramenta com as respostas em
 * `updatedInput.answers`, um mapa do texto da pergunta para a resposta.
 */

export const QUESTION_TOOL = 'AskUserQuestion'

/** Tamanho máximo de uma resposta escrita pelo usuário. */
const MAX_ANSWER = 2000

export interface Question {
  question: string
  multiSelect: boolean
}

/** As perguntas de um pedido, ou null se o formato não for o esperado. */
export function parseQuestions(input: unknown): Question[] | null {
  const questions = (input as { questions?: unknown } | null)?.questions
  if (!Array.isArray(questions) || questions.length === 0) return null
  const parsed: Question[] = []
  for (const item of questions) {
    const question = (item as { question?: unknown } | null)?.question
    if (typeof question !== 'string' || !question) return null
    parsed.push({ question, multiSelect: (item as { multiSelect?: unknown }).multiSelect === true })
  }
  return parsed
}

/**
 * Confere as respostas que vieram do chat: uma para cada pergunta, nenhuma a mais, todas texto
 * não vazio. Devolve o mapa limpo para o `updatedInput.answers`, ou null se algo não bater.
 * Opções marcadas numa pergunta de múltipla escolha chegam juntas, separadas por vírgula, o
 * formato que o Claude Code aceita em todas as versões.
 */
export function checkAnswers(
  questions: Question[],
  answers: unknown
): Record<string, string> | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const given = answers as Record<string, unknown>
  if (Object.keys(given).length !== questions.length) return null
  const checked: Record<string, string> = {}
  for (const { question } of questions) {
    const value = given[question]
    if (typeof value !== 'string') return null
    const answer = value.trim()
    if (!answer || answer.length > MAX_ANSWER) return null
    checked[question] = answer
  }
  return checked
}

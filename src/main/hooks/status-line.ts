// A linha de status do modo terminal (Fase 17): o Claude Code roda o relay a cada mudança, com o
// estado da sessão em JSON, e mostra o que ele imprimir embaixo da caixa dele. O mesmo JSON vai
// para o Wisp (o contexto, os tokens e o modelo das pílulas). Só Node: entra no bundle do relay.
//
// O custo não aparece: o total_cost_usd do Claude Code usa os preços da Anthropic, que não valem
// nem para a assinatura (não se paga por uso) nem para a OpenRouter (outros preços). Pela
// OpenRouter, o Wisp calcula o custo pelos preços dela, na pílula.

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

/** O que a linha de status recebe do Claude Code e o Wisp usa. */
export interface StatusInfo {
  model: string | null
  /** Tokens que a conversa ocupa e o tamanho da janela de contexto. */
  used: number | null
  window: number | null
  percent: number | null
  /** Os tokens que entraram e saíram na sessão inteira (para o custo pela OpenRouter). */
  inputTokens: number | null
  outputTokens: number | null
}

/** Lê o JSON da linha de status (campos que faltam viram null). */
export function readStatus(input: unknown): StatusInfo {
  const root = isObject(input) ? input : {}
  const model = isObject(root.model) ? root.model : {}
  const context = isObject(root.context_window) ? root.context_window : {}
  const current = isObject(context.current_usage) ? context.current_usage : null
  const used = current
    ? (number(current.input_tokens) ?? 0) +
      (number(current.cache_creation_input_tokens) ?? 0) +
      (number(current.cache_read_input_tokens) ?? 0) +
      (number(current.output_tokens) ?? 0)
    : null
  const id = typeof model.id === 'string' && model.id ? model.id.slice(0, 120) : null
  return {
    model: id,
    used,
    window: number(context.context_window_size),
    percent: number(context.used_percentage),
    inputTokens: number(context.total_input_tokens),
    outputTokens: number(context.total_output_tokens)
  }
}

/** A linha que aparece no terminal: o modelo e o contexto. */
export function statusLine(input: unknown): string {
  const status = readStatus(input)
  const display =
    isObject(input) && isObject(input.model) && typeof input.model.display_name === 'string'
      ? input.model.display_name.slice(0, 60)
      : status.model
  const parts = ['Wisp']
  if (display) parts.push(display)
  if (status.percent !== null) parts.push(`contexto ${Math.round(status.percent)}%`)
  return parts.join(' · ')
}

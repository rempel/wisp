// A OpenRouter como provedor das conversas (Fase 14, experimental). O cérebro continua sendo o
// Claude Code: ele fala com a OpenRouter pelo endpoint compatível com a API da Anthropic, com a
// chave da pessoa (guardada no chaveiro do sistema, secrets.ts) e o modelo que ela escolher.
//
// - A chave vai só no ambiente do processo do Claude Code (ANTHROPIC_AUTH_TOKEN), nunca em
//   argumentos, no config.json ou no registro.
// - As conversas pela OpenRouter têm um CLAUDE_CONFIG_DIR só delas: o login da assinatura (em
//   ~/.claude) nunca é tocado, e uma conversa não vaza para o outro lado.
// - O custo é estimado pelos preços que a própria OpenRouter publica (/models) e pelos tokens de
//   cada resposta. O total_cost_usd do Claude Code não serve: ele usa a tabela de preços da
//   Anthropic, que não vale para outros modelos.

import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from './paths'
import { claudeConfigDir } from './skills'

/** O endereço da OpenRouter (WISP_OPENROUTER_URL troca, para os testes). */
export function openrouterUrl(): string {
  return (process.env.WISP_OPENROUTER_URL || 'https://openrouter.ai/api').trim().replace(/\/+$/, '')
}
/** O nome da chave no chaveiro. */
export const OPENROUTER_SECRET = 'openrouter'
/** A pasta de configuração do Claude Code das conversas pela OpenRouter. */
export const OPENROUTER_CONFIG_DIR = join(DATA_DIR, 'openrouter-claude')
const MODELS_TTL_MS = 60 * 60_000
const FETCH_TIMEOUT_MS = 15_000

/** Uma chave da OpenRouter tem essa cara ("sk-or-v1-…"); o resto é provavelmente outra coisa. */
export function looksLikeKey(key: string): boolean {
  return /^sk-or-[A-Za-z0-9_-]{16,200}$/.test(key)
}

/**
 * O ambiente a mais do processo do Claude Code numa conversa pela OpenRouter. Todos os papéis de
 * modelo (o principal, o rápido de tarefas internas, os subagentes) usam o escolhido: os nomes da
 * Anthropic que o Claude Code usaria por padrão não existem do outro lado.
 */
export function openrouterEnv(key: string, model: string): Record<string, string> {
  mkdirSync(OPENROUTER_CONFIG_DIR, { recursive: true, mode: 0o700 })
  linkPersonalSkills()
  return {
    ANTHROPIC_BASE_URL: openrouterUrl(),
    ANTHROPIC_AUTH_TOKEN: key,
    // Vazia de propósito: uma chave da Anthropic herdada iria junto para a OpenRouter.
    ANTHROPIC_API_KEY: '',
    CLAUDE_CONFIG_DIR: OPENROUTER_CONFIG_DIR,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    // Nada de telemetria nem de chamadas à Anthropic por fora: só a OpenRouter.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  }
}

/**
 * As skills pessoais (as de ~/.claude/skills) valem também pela OpenRouter: a pasta de
 * configuração de lá ganha um link para elas. Só as skills: o login, o histórico e o resto da
 * configuração da assinatura continuam separados. Uma pasta "skills" de verdade, criada ali à
 * mão, fica como está.
 */
export function linkPersonalSkills(
  personal = join(claudeConfigDir(), 'skills'),
  configDir = OPENROUTER_CONFIG_DIR
): void {
  const link = join(configDir, 'skills')
  try {
    lstatSync(link)
    return
  } catch {
    // Ainda não existe.
  }
  if (!existsSync(personal)) return
  try {
    symlinkSync(personal, link, 'dir')
  } catch (err) {
    console.warn('[wisp] não consegui ligar as skills pessoais à OpenRouter:', err)
  }
}

/** Um modelo da OpenRouter, com os preços em dólares por milhão de tokens. */
export interface OpenRouterModel {
  id: string
  name: string
  /** Entrada, saída, leitura e escrita de cache; null quando a OpenRouter não informa. */
  prompt: number | null
  completion: number | null
  cacheRead: number | null
  cacheWrite: number | null
  context: number | null
}

const perMillion = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : null
}

/** A resposta do /v1/models, só com o que interessa (o que vier estranho fica de fora). */
export function parseModels(body: unknown): OpenRouterModel[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const out: OpenRouterModel[] = []
  for (const item of data as Record<string, unknown>[]) {
    if (typeof item?.id !== 'string' || !/^[\w.:/@[\]~-]{1,100}$/.test(item.id)) continue
    const pricing = (item.pricing ?? {}) as Record<string, unknown>
    out.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name.slice(0, 120) : item.id,
      prompt: perMillion(pricing.prompt),
      completion: perMillion(pricing.completion),
      cacheRead: perMillion(pricing.input_cache_read),
      cacheWrite: perMillion(pricing.input_cache_write),
      context: typeof item.context_length === 'number' ? item.context_length : null
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

async function getJson(path: string, key?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${openrouterUrl()}${path}`, {
    headers: { accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Sem corpo, ou não é JSON: o status basta.
  }
  return { status: response.status, body }
}

let cache: { at: number; models: OpenRouterModel[] } | null = null

/** Os modelos da OpenRouter (a lista é pública; guardada por uma hora). */
export async function listModels(now = Date.now()): Promise<OpenRouterModel[]> {
  if (cache && now - cache.at < MODELS_TTL_MS) return cache.models
  const { status, body } = await getJson('/v1/models')
  if (status !== 200) throw new Error(`a OpenRouter respondeu ${status}`)
  const models = parseModels(body)
  if (!models.length) throw new Error('a OpenRouter mandou uma lista vazia')
  cache = { at: now, models }
  return models
}

/** Os preços de um modelo, se a lista já veio (sem rede: o custo só espera a lista). */
export function cachedModel(id: string): OpenRouterModel | null {
  return cache?.models.find((model) => model.id === id) ?? null
}

/** Esquece a lista (os testes). */
export function clearModelsCache(): void {
  cache = null
}

/** Confere uma chave na OpenRouter: ok, recusada, ou não deu para saber (sem rede). */
export async function checkKey(
  key: string
): Promise<{ ok: true; label: string | null } | { ok: false; message: string }> {
  let result: { status: number; body: unknown }
  try {
    result = await getJson('/v1/key', key)
  } catch (err) {
    return {
      ok: false,
      message: `Não consegui falar com a OpenRouter (${(err as Error).message}). Confira a conexão.`
    }
  }
  if (result.status === 401 || result.status === 403) {
    return { ok: false, message: 'A OpenRouter recusou essa chave. Confira se copiou ela inteira.' }
  }
  if (result.status !== 200) {
    return { ok: false, message: `A OpenRouter respondeu ${result.status} ao conferir a chave.` }
  }
  const label = (result.body as { data?: { label?: unknown } } | null)?.data?.label
  return { ok: true, label: typeof label === 'string' && label ? label.slice(0, 80) : null }
}

/** Os tokens de uma resposta (o usage do result do Claude Code). */
export interface TurnUsage {
  input_tokens?: unknown
  output_tokens?: unknown
  cache_read_input_tokens?: unknown
  cache_creation_input_tokens?: unknown
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

/**
 * O custo de uma resposta, em dólares, pelos preços do modelo; null se faltar o preço da entrada
 * ou da saída. O cache sem preço próprio é cobrado como entrada.
 */
export function turnCost(usage: TurnUsage, model: OpenRouterModel | null): number | null {
  if (!model || model.prompt === null || model.completion === null) return null
  const input = count(usage.input_tokens)
  const output = count(usage.output_tokens)
  const read = count(usage.cache_read_input_tokens)
  const write = count(usage.cache_creation_input_tokens)
  return (
    (input * model.prompt +
      output * model.completion +
      read * (model.cacheRead ?? model.prompt) +
      write * (model.cacheWrite ?? model.prompt)) /
    1e6
  )
}

/** Os tokens de entrada e de saída de uma resposta (o cache conta como entrada). */
export function turnTokens(usage: TurnUsage): { input: number; output: number } {
  return {
    input:
      count(usage.input_tokens) +
      count(usage.cache_read_input_tokens) +
      count(usage.cache_creation_input_tokens),
    output: count(usage.output_tokens)
  }
}

const KEY_ERROR = /\b401\b|invalid api key|no auth|unauthori[sz]ed|user not found|authenticat/i
const CREDITS = /\b402\b|insufficient|credits|payment required/i
const MODEL_MISSING =
  /not a valid model|no endpoints found|model .{0,80}(?:not (?:found|available|exist)|does not exist)|unrecognized_model|\b404\b/i
const RATE = /\b429\b|rate.?limit/i

/** Os erros da OpenRouter em português, com o texto original como detalhe. */
export function openrouterError(text: string, model: string | null): string {
  const detail = `\n\nDetalhe: \`${text.replace(/`/g, "'").slice(0, 300)}\``
  if (KEY_ERROR.test(text)) {
    return (
      'A OpenRouter recusou a chave. Troque-a em **Configurações → OpenRouter** e mande a ' +
      'mensagem de novo.' +
      detail
    )
  }
  if (CREDITS.test(text)) {
    return 'Acabaram os créditos da sua conta na OpenRouter (ou o limite da chave).' + detail
  }
  if (MODEL_MISSING.test(text)) {
    return (
      `A OpenRouter não achou o modelo \`${model ?? '?'}\`, ou ele não aceita ferramentas. ` +
      'Escolha outro na pílula do modelo.' +
      detail
    )
  }
  if (RATE.test(text)) {
    return (
      'A OpenRouter pediu para ir mais devagar (limite de pedidos). Tente daqui a pouco.' + detail
    )
  }
  return `A OpenRouter respondeu com um erro.${detail}`
}

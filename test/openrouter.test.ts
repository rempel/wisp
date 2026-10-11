// A OpenRouter (openrouter.ts): o ambiente do Claude Code, a lista de modelos e a conferência da
// chave (com um servidor de mentira), o custo pelos preços dela e os erros em português.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import {
  checkKey,
  clearModelsCache,
  listModels,
  looksLikeKey,
  openrouterEnv,
  openrouterError,
  parseModels,
  turnCost,
  turnTokens
} from '../src/main/openrouter'
import { checkSettings } from '../src/main/config'
import { formatTokens, formatUsd, priceLabel } from '../src/shared/format'

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef'
const seen: { url: string; auth?: string }[] = []
const server = createServer((req, res) => {
  seen.push({ url: req.url ?? '', auth: req.headers.authorization })
  res.setHeader('content-type', 'application/json')
  if (req.url === '/api/v1/models') {
    return res.end(
      JSON.stringify({
        data: [
          {
            id: 'vendor/model-b',
            name: 'Vendor: Model B',
            context_length: 128000,
            pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003' }
          },
          { id: 'vendor/free:free', name: 'Free', pricing: { prompt: '0', completion: '0' } },
          { id: 'bad id with spaces', name: 'x' },
          { name: 'sem id' }
        ]
      })
    )
  }
  if (req.url === '/api/v1/key') {
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.statusCode = 401
      return res.end('{"error":{"message":"No auth credentials found","code":401}}')
    }
    return res.end(JSON.stringify({ data: { label: 'sk-or-v1-012...def', usage: 0.5 } }))
  }
  res.statusCode = 404
  res.end('{}')
})

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  process.env.WISP_OPENROUTER_URL = `http://127.0.0.1:${port}/api/`
})
after(() => server.close())

test('uma chave da OpenRouter tem cara de chave', () => {
  assert.equal(looksLikeKey(KEY), true)
  assert.equal(looksLikeKey('sk-ant-api03-xxxxxxxxxxxxxxxxxxxx'), false)
  assert.equal(looksLikeKey(`${KEY} ; rm -rf ~`), false)
  assert.equal(looksLikeKey(''), false)
})

test('o ambiente do Claude Code: endereço, chave, pasta própria e o modelo em todos os papéis', () => {
  const env = openrouterEnv(KEY, 'vendor/model-b')
  assert.equal(env.ANTHROPIC_BASE_URL, process.env.WISP_OPENROUTER_URL?.replace(/\/$/, ''))
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, KEY)
  assert.equal(env.ANTHROPIC_API_KEY, '', 'vazia: uma chave da Anthropic herdada não vai junto')
  assert.equal(env.CLAUDE_CONFIG_DIR, join(HOME, '.local/share/wisp/openrouter-claude'))
  assert.equal((statSync(env.CLAUDE_CONFIG_DIR).mode & 0o777).toString(8), '700')
  for (const name of [
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'CLAUDE_CODE_SUBAGENT_MODEL'
  ]) {
    assert.equal(env[name], 'vendor/model-b', name)
  }
  assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1')
})

test('a lista de modelos: preços por milhão, o que vier estranho fica de fora', async () => {
  clearModelsCache()
  const models = await listModels()
  assert.deepEqual(
    models.map((m) => m.id),
    ['vendor/free:free', 'vendor/model-b']
  )
  const b = models[1]
  assert.deepEqual(
    {
      prompt: b.prompt,
      completion: b.completion,
      cacheRead: b.cacheRead,
      cacheWrite: b.cacheWrite
    },
    { prompt: 3, completion: 15, cacheRead: 0.3, cacheWrite: null }
  )
  assert.equal(b.context, 128000)
  assert.equal(seen.at(-1)?.auth, undefined, 'a lista é pública: a chave não vai')
  const calls = seen.length
  await listModels()
  assert.equal(seen.length, calls, 'guardada por uma hora')
  assert.deepEqual(parseModels({ data: 'x' }), [])
  assert.deepEqual(parseModels(null), [])
})

test('conferir a chave: aceita, recusada e sem rede', async () => {
  assert.deepEqual(await checkKey(KEY), { ok: true, label: 'sk-or-v1-012...def' })
  const refused = await checkKey('sk-or-v1-errada000000000000000')
  assert.ok(!refused.ok && /recusou essa chave/.test(refused.message))
  const saved = process.env.WISP_OPENROUTER_URL
  process.env.WISP_OPENROUTER_URL = 'http://127.0.0.1:9/api'
  const offline = await checkKey(KEY)
  assert.ok(!offline.ok && offline.message.startsWith('Não consegui falar'))
  process.env.WISP_OPENROUTER_URL = saved
})

test('o custo de uma resposta, pelos preços da OpenRouter', () => {
  const model = {
    id: 'm',
    name: 'm',
    prompt: 3,
    completion: 15,
    cacheRead: 0.3,
    cacheWrite: null,
    context: null
  }
  const usage = {
    input_tokens: 1000,
    output_tokens: 50,
    cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 100
  }
  // 1000×3 + 50×15 + 2000×0,3 + 100×3 (a escrita de cache sem preço próprio é entrada), por milhão.
  assert.equal(turnCost(usage, model), (3000 + 750 + 600 + 300) / 1e6)
  assert.equal(turnCost(usage, null), null)
  assert.equal(turnCost(usage, { ...model, completion: null }), null)
  assert.deepEqual(turnTokens(usage), { input: 3100, output: 50 })
  assert.deepEqual(turnTokens({ input_tokens: -5, output_tokens: 'x' }), { input: 0, output: 0 })
})

test('os erros da OpenRouter em português', () => {
  assert.match(openrouterError('API Error: 401 User not found.', 'v/m'), /recusou a chave/)
  assert.match(openrouterError('402 Insufficient credits', 'v/m'), /créditos/)
  assert.match(
    openrouterError('400 v/m is not a valid model ID', 'v/m'),
    /não achou o modelo `v\/m`/
  )
  assert.match(openrouterError('429 Rate limit exceeded', 'v/m'), /mais devagar/)
  assert.match(openrouterError('algo estranho', 'v/m'), /respondeu com um erro/)
})

test('o config aceita o provedor e qualquer modelo da OpenRouter, nada além', () => {
  assert.deepEqual(
    checkSettings({ provider: 'openrouter', openrouterModel: 'meta-llama/llama-3.3-70b:free' }),
    {
      ok: true,
      patch: { provider: 'openrouter', openrouterModel: 'meta-llama/llama-3.3-70b:free' }
    }
  )
  assert.equal(checkSettings({ provider: 'anthropic-api' }).ok, false)
  const bad = checkSettings({ openrouterModel: 'v/m --dangerously-skip-permissions' })
  assert.ok(!bad.ok && bad.field === 'openrouterModel' && /provedor\/modelo/.test(bad.message))
  assert.equal(checkSettings({ openrouterModel: '-v/m' }).ok, false)
})

test('os números da pílula de custo e dos preços', () => {
  assert.equal(formatUsd(0.004651), 'US$ 0,0047')
  assert.equal(formatUsd(1.256), 'US$ 1,26')
  assert.equal(formatUsd(0.00001), '< US$ 0,0001')
  assert.equal(formatTokens(850), '850')
  assert.equal(formatTokens(12_345), '12,3 mil')
  assert.equal(formatTokens(1_234_567), '1,2 mi')
  assert.equal(priceLabel({ prompt: 3, completion: 15 }), 'US$ 3 / 15')
  assert.equal(priceLabel({ prompt: 0, completion: 0 }), 'grátis')
  assert.equal(priceLabel({ prompt: 0.15, completion: 0.6 }), 'US$ 0,15 / 0,6')
  assert.equal(priceLabel({ prompt: null, completion: 1 }), '')
})

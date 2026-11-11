// Os modelos locais (Fase 66): com o endereço de um servidor (Ollama, LM Studio) nas
// configurações, o outro provedor das conversas é esse servidor, sem chave, e a lista de
// modelos vem dele; sem o endereço, tudo volta para a OpenRouter.
import './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname } from 'node:path'
import { after, before, test } from 'node:test'
import { checkSettings, CONFIG_PATH, loadConfig } from '../src/main/config'
import {
  clearModelsCache,
  listModels,
  LOCAL_KEY,
  localModelsUrl,
  openrouterEnv,
  openrouterUrl
} from '../src/main/openrouter'

let asked = 0
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/v1/models') {
    asked++
    // A lista de um servidor local, no formato da OpenAI: sem preços.
    return res.end(
      JSON.stringify({
        object: 'list',
        data: [
          { id: 'qwen3-coder:30b', object: 'model' },
          { id: 'llama3.3', object: 'model' }
        ]
      })
    )
  }
  res.statusCode = 404
  res.end('{}')
})
let local = ''
const setConfig = (config: Record<string, unknown>): void => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config))
  loadConfig()
  clearModelsCache()
}

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

test('sem o endereço, o outro provedor é a OpenRouter', () => {
  setConfig({})
  assert.equal(localModelsUrl(), null)
  assert.equal(openrouterUrl(), 'https://openrouter.ai/api')
})

test('com o endereço, as conversas e a lista de modelos vão para o servidor local', async () => {
  setConfig({ localModelsUrl: `${local}/` })
  assert.equal(localModelsUrl(), local)
  assert.equal(openrouterUrl(), local)
  const env = openrouterEnv(LOCAL_KEY, 'qwen3-coder:30b')
  assert.equal(env.ANTHROPIC_BASE_URL, local)
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'local')
  assert.equal(env.ANTHROPIC_API_KEY, '')
  assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'qwen3-coder:30b')
  const models = await listModels()
  assert.deepEqual(
    models.map((model) => [model.id, model.prompt]),
    [
      ['llama3.3', null],
      ['qwen3-coder:30b', null]
    ]
  )
  await listModels()
  assert.equal(asked, 1, 'a lista fica guardada por um instante')
})

test('trocar o endereço não reaproveita a lista do outro', async () => {
  setConfig({ localModelsUrl: local })
  await listModels()
  const before = asked
  // Outro endereço (a mesma máquina por outro nome): a lista é pedida de novo.
  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ localModelsUrl: local.replace('127.0.0.1', 'localhost') })
  )
  loadConfig()
  await listModels().catch(() => undefined)
  assert.ok(asked > before || openrouterUrl().includes('localhost'))
})

test('o endereço das configurações é um http ou https, e mais nada', () => {
  const ok = (value: unknown): boolean => checkSettings({ localModelsUrl: value }).ok
  assert.ok(ok('http://localhost:11434'))
  assert.ok(ok('https://modelos.minha-rede.lan/v1'))
  assert.ok(ok(null))
  assert.ok(!ok('localhost:11434'))
  assert.ok(!ok('file:///etc/passwd'))
  assert.ok(!ok('http://localhost:11434/?x=$(rm -rf ~)'))
  assert.ok(!ok('http://a b'))
})

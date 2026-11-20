// A busca no que o Wisp lembra (Fase 80): o índice no SQLite (o node:sqlite, com FTS5), os
// trechos, o que entra (a memória, o diário, as conversas; nem as anônimas nem as das pastas
// fora), a busca por texto, a por sentido (com um gerador de vetores de mentira e com o caminho
// de verdade, ONNX Runtime e tokenizador, sobre um modelo minúsculo), o download do modelo e a
// ferramenta memory_search.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { FIXTURES } from './helpers/paths'
import { SAFE_TOOLS } from '../src/main/claude'
import {
  downloadModel,
  EMBEDDING_MODEL,
  loadEmbedder,
  meanPool,
  modelInstalled,
  removeModel
} from '../src/main/embeddings'
import type { Embedder } from '../src/main/embeddings'
import { History } from '../src/main/history'
import { describeHits } from '../src/main/mcp-memory'
import { chunksOf, ftsQuery, MemoryIndex } from '../src/main/memory-index'
import { startDesktopServer } from '../src/main/mcp-server'
import { PersonalMemory } from '../src/main/personal-memory'

let n = 0
/** Uma memória, um histórico e um índice só deste teste. */
function setup(embedder: Embedder | null = null, excluded: string[] = []) {
  const root = join(HOME, `busca-${++n}`)
  const memory = new PersonalMemory(join(root, 'memoria'))
  const history = new History(join(root, 'conversas'))
  const index = new MemoryIndex({
    file: join(root, 'cache', 'memoria.sqlite'),
    memoryDir: memory.dir,
    historyDir: join(root, 'conversas'),
    load: (id) => history.load(id),
    excluded: () => excluded,
    embedder: async () => embedder
  })
  const converse = (
    texts: [string, string],
    options: { anonymous?: boolean; cwd?: string } = {}
  ): string => {
    history.anonymous = options.anonymous ?? false
    history.cwd = options.cwd ?? null
    history.user(randomUUID(), texts[0], [], false)
    history.record({ type: 'text', blockId: 'b1', delta: texts[1] })
    history.flush()
    const id = history.currentId()!
    history.record({ type: 'reset' })
    return id
  }
  return { root, memory, history, index, converse }
}

/** Vetores de mentira: cada "tema" é uma direção; palavras do mesmo tema apontam juntas. */
const THEMES: Record<string, string[]> = {
  comida: ['restaurante', 'jantar', 'sushi', 'comer', 'shiro'],
  carro: ['carro', 'oficina', 'pneu', 'mecânico'],
  viagem: ['viagem', 'lisboa', 'avião', 'férias']
}
const fakeEmbedder: Embedder = {
  name: 'tema-v1',
  async embed(texts) {
    return texts.map((text) => {
      const lower = text.toLowerCase()
      const vector = Float32Array.from(Object.values(THEMES), (words) =>
        words.some((word) => lower.includes(word)) ? 1 : 0.01
      )
      const norm = Math.hypot(...vector)
      return vector.map((value) => value / norm)
    })
  }
}

test('busca: os trechos têm umas 200 palavras, com sobreposição', () => {
  const words = Array.from({ length: 450 }, (_, i) => `p${i}`).join(' ')
  const chunks = chunksOf(words)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].split(' ').length, 200)
  assert.ok(chunks[1].startsWith('p160 '), 'o segundo começa 40 palavras antes do fim do primeiro')
  assert.deepEqual(chunksOf('   '), [])
  // As palavras de uma letra ficam de fora; as de 4 ou mais acham o começo de outras.
  assert.equal(ftsQuery('Qual é o restaurante?'), '"qual"* OR "restaurante"*')
  assert.equal(ftsQuery('o pr da loja'), '"pr" OR "da" OR "loja"*')
  assert.equal(ftsQuery('?!'), null)
  assert.equal(ftsQuery('Ação ação'), '"acao"*')
})

test('busca: por texto, sem acentos, na memória, no diário e nas conversas', async () => {
  const { memory, index, converse } = setup()
  memory.save('memoria', 'O deploy da loja é na sexta')
  memory.save('eu', 'A Ana é a irmã dele')
  mkdirSync(join(memory.dir, 'diario'), { recursive: true })
  writeFileSync(
    memory.path('diario', '2026-11-10'),
    '# 10 de novembro\n\n- 09:00 Jantar no Shiro\n'
  )
  const id = converse(['Onde fica a oficina do carro?', 'Fica na rua das Flores, 120.'])
  let hits = await index.search('deploy loja')
  assert.equal(hits[0].source, 'memoria')
  assert.match(hits[0].text, /deploy da loja/)
  hits = await index.search('irma')
  assert.match(hits[0].text, /Ana é a irmã/)
  hits = await index.search('oficina')
  assert.equal(hits[0].source, 'conversa')
  assert.equal(hits[0].conversation, id)
  assert.match(hits[0].text, /Usuário: Onde fica a oficina/)
  assert.match(hits[0].text, /Claude: Fica na rua das Flores/)
  // Uma palavra de 4 letras ou mais acha as que começam com ela.
  hits = await index.search('jant')
  assert.equal(hits[0].source, 'diario')
  assert.equal(new Date(hits[0].at).getDate(), 10)
  // Filtros: a fonte e o período.
  assert.equal((await index.search('jantar', { source: 'conversa' })).length, 0)
  const nov = new Date(2026, 10, 11).getTime()
  assert.equal((await index.search('jantar', { from: nov })).length, 0)
  assert.equal((await index.search('jantar', { to: nov })).length, 1)
  index.close()
})

test('busca: o índice acompanha as mudanças e tira o que sumiu', async () => {
  const { memory, index } = setup()
  memory.save('memoria', 'Gosta de café coado')
  assert.equal((await index.search('cafe')).length, 1)
  memory.forget('memoria', 'café')
  memory.save('memoria', 'Passou a gostar de chá verde')
  assert.equal((await index.search('cafe')).length, 0)
  assert.equal((await index.search('cha verde')).length, 1)
  rmSync(memory.path('memoria'))
  assert.equal((await index.search('cha')).length, 0)
  index.close()
})

test('busca: conversas anônimas e das pastas fora da memória não entram', async () => {
  const clients = join(HOME, `clientes-${n}`)
  mkdirSync(join(clients, 'acme'), { recursive: true })
  const excluded: string[] = []
  const { index, converse } = setup(null, excluded)
  converse(['O segredo do bolo é a canela', 'Anotado.'], { anonymous: true })
  converse(['O cliente quer o botão roxo', 'Certo.'], { cwd: join(clients, 'acme') })
  converse(['Quero o botão verde no meu site', 'Feito.'])
  assert.equal((await index.search('canela')).length, 0, 'a anônima fica de fora')
  assert.equal((await index.search('roxo')).length, 1)
  // A pasta passa a ficar fora: a conversa dela sai do índice.
  excluded.push(clients)
  assert.equal((await index.search('roxo')).length, 0)
  assert.equal((await index.search('verde')).length, 1)
  index.close()
})

test('busca: por sentido, com o modelo, acha sem as palavras; sem ele, só texto', async () => {
  const { memory, index, converse } = setup(fakeEmbedder)
  converse(['A Ana indicou um lugar', 'Jantar no Shiro, sugestão dela.'])
  converse(['O pneu furou de novo', 'Leve ao mecânico.'])
  memory.save('memoria', 'Vai para Lisboa nas férias')
  await index.search('aquecimento')
  await index.embedPending()
  assert.deepEqual(index.stats(), { chunks: 3, vectors: 3 })
  const hits = await index.search('qual era aquele restaurante?')
  assert.match(hits[0].text, /Shiro/, 'achou pelo sentido, sem a palavra "restaurante"')
  const trip = await index.search('avião')
  assert.match(trip[0].text, /Lisboa/)
  // Um modelo diferente refaz os vetores.
  const other = { ...fakeEmbedder, name: 'tema-v2' }
  const second = new MemoryIndex({
    ...(index as unknown as { options: ConstructorParameters<typeof MemoryIndex>[0] }).options,
    embedder: async () => other
  })
  index.close()
  await second.embedPending()
  assert.deepEqual(second.stats(), { chunks: 3, vectors: 3 })
  second.close()
})

test('busca: o caminho de verdade (ONNX Runtime e tokenizador) com um modelo minúsculo', async () => {
  const embedder = await loadEmbedder(join(FIXTURES, 'modelo-mini'))
  assert.equal(embedder.name, EMBEDDING_MODEL.id)
  const [a, b, c] = await embedder.embed(
    ['jantar no restaurante', 'sushi no restaurante', 'carro na oficina'],
    'passage'
  )
  assert.equal(a.length, 8)
  const cos = (x: Float32Array, y: Float32Array): number => x.reduce((s, v, i) => s + v * y[i], 0)
  assert.ok(Math.abs(cos(a, a) - 1) < 1e-5, 'normalizado')
  assert.ok(cos(a, b) > cos(a, c), 'jantar fica mais perto de sushi que de carro')
  // A média só conta os tokens de verdade (a máscara).
  const pooled = meanPool(
    { data: Float32Array.from([1, 0, 3, 0, 100, 100]), dims: [1, 3, 2] },
    [1, 1, 0]
  )
  assert.deepEqual(
    [...pooled].map((v) => Math.round(v * 1000) / 1000),
    [1, 0]
  )
})

test('busca: baixar o modelo só com os arquivos inteiros, e tirar', async () => {
  const dir = join(HOME, 'modelos-teste', EMBEDDING_MODEL.id)
  const asked: string[] = []
  const ok = (async (url: string) => {
    asked.push(url)
    return new Response(url.endsWith('.json') ? '{"model":{}}' : 'bytes-do-modelo', {
      headers: { 'content-length': '15' }
    })
  }) as unknown as typeof fetch
  const status = await downloadModel(dir, ok)
  assert.equal(status.installed, true)
  assert.ok(status.bytes > 0)
  assert.deepEqual(asked, [
    'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/tokenizer.json',
    'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx'
  ])
  assert.equal(readFileSync(join(dir, 'model.onnx'), 'utf8'), 'bytes-do-modelo')
  assert.equal(removeModel(dir).installed, false)
  assert.equal(existsSync(dir), false)
  // Uma falha no meio: nada fica pela metade, e o erro aparece.
  let calls = 0
  const failing = (async () => {
    calls++
    return calls === 1 ? new Response('{}') : new Response('não', { status: 404 })
  }) as unknown as typeof fetch
  const failed = await downloadModel(dir, failing)
  assert.equal(failed.installed, false)
  assert.match(failed.error ?? '', /404/)
  assert.equal(modelInstalled(dir), false)
  assert.equal(existsSync(join(dir, 'model.onnx.baixando')), false)
})

test('busca: memory_search, liberada, com os filtros e só onde a memória vale', async () => {
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__memory_search'))
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const { memory, index } = setup()
  memory.save('memoria', 'O deploy da loja é na sexta')
  const asked: unknown[] = []
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    memory: {
      memory: () => memory,
      scope: (id) =>
        id === 'normal'
          ? { access: 'full', origin: {} }
          : id === 'anonima'
            ? { access: 'off', origin: {} }
            : null,
      search: (query, options) => {
        asked.push(options)
        return index.search(query, options)
      }
    }
  })
  try {
    const call = async (conversation: string, args: unknown) => {
      const desktop = JSON.parse(readFileSync(server.configFor(conversation), 'utf8')).mcpServers
        .desktop
      const res = await fetch(desktop.url, {
        method: 'POST',
        headers: {
          ...desktop.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'memory_search', arguments: args }
        })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body).result as {
        isError?: boolean
        content: { text: string }[]
      }
    }
    const found = await call('normal', {
      consulta: 'deploy',
      fonte: 'memoria',
      desde: '2020-01-01'
    })
    assert.equal(found.isError, undefined)
    assert.match(found.content[0].text, /\[memória · \d{4}-\d{2}-\d{2} · MEMORIA\.md · nota/)
    assert.match(found.content[0].text, /deploy da loja/)
    assert.deepEqual(Object.keys(asked[0] as object).sort(), ['from', 'limit', 'source', 'to'])
    assert.equal((asked[0] as { source: string }).source, 'memoria')
    const none = await call('normal', { consulta: 'girafa' })
    assert.match(none.content[0].text, /Nada achado/)
    const bad = await call('normal', { consulta: 'deploy', desde: 'ontem' })
    assert.equal(bad.isError, true)
    const anonymous = await call('anonima', { consulta: 'deploy' })
    assert.equal(anonymous.isError, true)
    assert.equal(asked.length, 2, 'a anônima nem chega a buscar')
  } finally {
    server.close()
    index.close()
  }
  assert.match(describeHits([]), /Nada achado/)
})

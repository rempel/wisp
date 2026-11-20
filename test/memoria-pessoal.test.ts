// A memória pessoal (Fase 79): anotar e esquecer nos arquivos (EU.md, MEMORIA.md, o diário), o
// registro com a origem e o desfazer, os segredos que nunca entram, o que vai para o prompt de
// cada conversa (anônima, numa pasta fora da memória ou normal) e as ferramentas do Claude.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { SAFE_TOOLS } from '../src/main/claude'
import { startDesktopServer } from '../src/main/mcp-server'
import type { MemoryScope } from '../src/main/mcp-memory'
import { History } from '../src/main/history'
import { memoryPath } from '../src/main/memory'
import {
  dayOf,
  looksSecret,
  memoryAccess,
  MEMORY_DIR,
  PersonalMemory
} from '../src/main/personal-memory'

/** 19 de novembro de 2026, 14:32, em São Paulo. */
const NOW = new Date(2026, 10, 19, 14, 32).getTime()
let dirs = 0
const fresh = (now = NOW): PersonalMemory =>
  new PersonalMemory(join(HOME, `memoria-${++dirs}`), () => now)
const read = (path: string): string => readFileSync(path, 'utf8')

test('memória pessoal: os arquivos ficam na pasta de dados, e a tela Memória os mostra', () => {
  const data = join(HOME, '.local', 'share', 'wisp')
  assert.equal(MEMORY_DIR, join(data, 'memoria'))
  assert.equal(memoryPath('me', null), join(MEMORY_DIR, 'EU.md'))
  assert.equal(memoryPath('facts', null), join(MEMORY_DIR, 'MEMORIA.md'))
  const memory = fresh()
  assert.equal(memory.path('diario'), join(memory.dir, 'diario', '2026-11-19.md'))
  assert.equal(dayOf(NOW), '2026-11-19')
})

test('memória pessoal: anotar cria o arquivo, uma linha por anotação, sem repetir', () => {
  const memory = fresh()
  const origin = { conversation: 'c1', title: 'Aniversários' }
  const saved = memory.save('memoria', '  O aniversário da Ana é\n3 de março. ', origin)
  assert.deepEqual(saved, { ok: true, message: 'Anotado em MEMORIA.md.' })
  const text = read(memory.path('memoria'))
  assert.match(text, /^# Memória\n/)
  assert.match(text, /\n- O aniversário da Ana é 3 de março\.\n$/)
  // O mesmo fato (sem diferenciar acentos nem maiúsculas) não entra duas vezes.
  assert.deepEqual(memory.save('memoria', 'o aniversario da ana e 3 de marco.'), {
    ok: true,
    message: 'Isso já estava na memória.'
  })
  assert.equal(read(memory.path('memoria')), text)
  memory.save('eu', 'Prefere respostas curtas')
  assert.match(read(memory.path('eu')), /^# Sobre mim\n[\s\S]*\n- Prefere respostas curtas\n$/)
  // O registro guarda cada uma, com a origem.
  const notes = memory.notes()
  assert.equal(notes.length, 2)
  assert.equal(notes[0].target, 'eu')
  assert.equal(notes[1].text, 'O aniversário da Ana é 3 de março.')
  assert.equal(notes[1].title, 'Aniversários')
  assert.equal(notes[1].conversation, 'c1')
  assert.equal(notes[1].action, 'save')
})

test('memória pessoal: o diário do dia leva a hora, e o mesmo texto não entra de novo', () => {
  const memory = fresh()
  assert.equal(memory.save('diario', 'Revisou o PR da loja').ok, true)
  assert.equal(memory.save('diario', 'revisou o PR da loja').ok, true)
  const text = read(memory.path('diario'))
  assert.match(text, /^# quinta-feira, 19 de novembro de 2026\n\n- 14:32 Revisou o PR da loja\n$/)
})

test('memória pessoal: segredos, textos vazios e longos não entram', () => {
  const memory = fresh()
  for (const secret of [
    'a senha do wifi é batata123',
    'senha: hunter2',
    'The password is correct-horse',
    'meu token=abc123def',
    'api key: xyz-987',
    'a chave é sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    'ghp_0123456789abcdefghijABCDEFGHIJ',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'AKIAIOSFODNN7EXAMPLE',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'o hash é 3f786850e387550fdab836ed7e6dc881de23001b'
  ]) {
    assert.ok(looksSecret(secret), `segredo: ${secret}`)
    const result = memory.save('memoria', secret)
    assert.equal(result.ok, false, secret)
  }
  // O que não é segredo passa, mesmo falando de senhas e chaves.
  for (const fine of [
    'Usa o gerenciador de senhas do sistema',
    'As chaves SSH dele ficam no ~/.ssh',
    'O plano de tokens da empresa é caro',
    'Mora em São Paulo, telefone +55 11 99999-0000'
  ]) {
    assert.equal(looksSecret(fine), false, fine)
  }
  assert.equal(memory.save('memoria', '   ').ok, false)
  assert.equal(memory.save('memoria', 'x'.repeat(501)).ok, false)
  assert.equal(memory.notes().length, 0)
})

test('memória pessoal: esquecer tira a linha; com várias, pede mais precisão ou todas', () => {
  const memory = fresh()
  memory.save('memoria', 'O deploy da loja é na sexta')
  memory.save('memoria', 'O deploy do blog é na segunda')
  memory.save('memoria', 'Gosta de café sem açúcar')
  const many = memory.forget('memoria', 'deploy')
  assert.equal(many.ok, false)
  assert.ok(!many.ok && many.error.includes('Há 2 anotações'))
  assert.ok(!many.ok && many.error.includes('- O deploy da loja é na sexta'))
  assert.deepEqual(memory.forget('memoria', 'DEPLOY DA LOJA'), {
    ok: true,
    message: 'Esqueci: O deploy da loja é na sexta'
  })
  assert.doesNotMatch(read(memory.path('memoria')), /loja/)
  assert.equal(memory.forget('memoria', 'loja').ok, false)
  assert.deepEqual(memory.forget('memoria', 'e', { all: true }), {
    ok: true,
    message: 'Esqueci 2 anotações.'
  })
  assert.doesNotMatch(read(memory.path('memoria')), /^- /m)
  assert.equal(memory.forget('diario', 'algo', { day: 'ontem' }).ok, false)
})

test('memória pessoal: desfazer tira o que entrou e devolve o que saiu', () => {
  const memory = fresh()
  memory.save('memoria', 'Tem um gato chamado Miúdo')
  memory.save('memoria', 'Trabalha de casa às sextas')
  const [second, first] = memory.notes()
  assert.equal(memory.undo(first.id).ok, true)
  assert.doesNotMatch(read(memory.path('memoria')), /Miúdo/)
  assert.match(read(memory.path('memoria')), /Trabalha de casa/)
  assert.equal(memory.undo(first.id).ok, false, 'desfazer duas vezes não vale')
  assert.ok(memory.notes()[1].undone)

  memory.forget('memoria', 'trabalha de casa')
  const forgotten = memory.notes()[0]
  assert.equal(forgotten.action, 'forget')
  assert.doesNotMatch(read(memory.path('memoria')), /Trabalha/)
  assert.equal(memory.undo(forgotten.id).ok, true)
  assert.match(read(memory.path('memoria')), /\n- Trabalha de casa às sextas\n$/)

  // Se você já tirou a linha à mão, desfazer só avisa.
  writeFileSync(memory.path('memoria'), '# Memória\n')
  const gone = memory.undo(second.id)
  assert.ok(gone.ok && gone.message.includes('já não estava'))
  assert.equal(memory.undo('nao-existe').ok, false)
})

test('memória pessoal: o prompt de cada conversa', () => {
  const memory = fresh()
  // Sem nada anotado, só as instruções.
  const empty = memory.prompt('full')
  assert.match(empty, /memory_save/)
  assert.doesNotMatch(empty, /<memoria_pessoal>/)
  memory.save('eu', 'Chama-se Gabriel e prefere respostas curtas')
  memory.save('memoria', 'O deploy da loja é na sexta')
  const full = memory.prompt('full')
  assert.match(full, /<memoria_pessoal>/)
  assert.match(full, /## Sobre o usuário \(EU\.md\)\n# Sobre mim\n\n- Chama-se Gabriel/)
  assert.match(full, /## Fatos e decisões \(MEMORIA\.md\)/)
  assert.match(full, /deploy da loja/)
  // O comentário de ajuda do arquivo não vai para o prompt.
  assert.doesNotMatch(full, /<!--|Edite à vontade/)
  // Numa pasta fora da memória: só o EU.md, e o aviso de não anotar.
  const read = memory.prompt('read')
  assert.match(read, /Chama-se Gabriel/)
  assert.doesNotMatch(read, /deploy da loja/)
  assert.match(read, /não anote nada aqui/)
  assert.doesNotMatch(read, /memory_save/)
  // Anônima: nada da memória.
  const off = memory.prompt('off')
  assert.doesNotMatch(off, /Gabriel|deploy/)
  assert.match(off, /conversa anônima/)
})

test('memória pessoal: um arquivo grande entra no prompt só com o fim (as mais novas)', () => {
  const memory = fresh()
  const lines = Array.from({ length: 400 }, (_, n) => `- Fato número ${n} sobre a vida`)
  mkdirSync(memory.dir, { recursive: true })
  writeFileSync(memory.path('memoria'), `# Memória\n\n${lines.join('\n')}\n`)
  const prompt = memory.prompt('full')
  assert.match(prompt, /Fato número 399 sobre/)
  assert.doesNotMatch(prompt, /Fato número 0 sobre/)
  assert.match(prompt, /as anotações mais antigas ficaram de fora/)
})

test('memória pessoal: o que cada conversa pode', () => {
  const clients = join(HOME, 'clientes')
  const inside = join(clients, 'acme', 'site')
  const other = join(HOME, 'projetos', 'loja')
  for (const dir of [inside, other]) mkdirSync(dir, { recursive: true })
  assert.equal(memoryAccess(true, null, []), 'off')
  assert.equal(memoryAccess(true, other, []), 'off')
  assert.equal(memoryAccess(false, null, [clients]), 'full')
  assert.equal(memoryAccess(false, other, [clients]), 'full')
  assert.equal(memoryAccess(false, clients, [clients]), 'read')
  assert.equal(memoryAccess(false, inside, ['~/clientes']), 'read')
  // Uma pasta com o mesmo começo de nome não é a de dentro.
  mkdirSync(join(HOME, 'clientes-antigos'), { recursive: true })
  assert.equal(memoryAccess(false, join(HOME, 'clientes-antigos'), [clients]), 'full')
  // Uma pasta excluída que não existe não exclui nada.
  assert.equal(memoryAccess(false, other, [join(HOME, 'sumiu')]), 'full')
  // Uma cópia do Git (Fase 43) vale como o projeto de onde saiu.
  const copy = join(HOME, 'copias', 'site-1')
  mkdirSync(copy, { recursive: true })
  const copies = (): { dir: string; repo: string }[] => [{ dir: copy, repo: inside }]
  assert.equal(memoryAccess(false, copy, [clients], copies), 'read')
  assert.equal(
    memoryAccess(false, copy, [clients], () => []),
    'full'
  )
})

test('memória pessoal: a conversa anônima fica marcada no histórico e volta anônima', () => {
  const history = new History()
  history.anonymous = true
  history.user(randomUUID(), 'oi', [], false)
  const id = history.currentId()
  assert.ok(id)
  history.flush()
  const saved = history.load(id)
  assert.equal(saved?.anonymous, true)
  const other = new History()
  assert.equal(other.anonymous, false)
  other.continue(saved!)
  assert.equal(other.anonymous, true)
  other.continue({ ...saved!, anonymous: undefined })
  assert.equal(other.anonymous, false)
})

interface RpcReply {
  result?: { isError?: boolean; content?: { text: string }[]; tools?: { name: string }[] }
  error?: unknown
}

test('memória pessoal: memory_save e memory_forget, liberadas, respeitando cada conversa', async () => {
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__memory_save'))
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__memory_forget'))
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const memory = fresh()
  const scopes: Record<string, MemoryScope> = {
    normal: { access: 'full', origin: { conversation: 'h1', title: 'Planos' } },
    anonima: { access: 'off', origin: {} },
    cliente: { access: 'read', origin: {} }
  }
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    memory: { memory: () => memory, scope: (id) => (id ? (scopes[id] ?? null) : null) }
  })
  try {
    const call = async (conversation: string, name: string, args: unknown): Promise<RpcReply> => {
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
          method: name === 'list' ? 'tools/list' : 'tools/call',
          params: name === 'list' ? {} : { name, arguments: args }
        })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body)
    }
    const names = (await call('normal', 'list', {})).result?.tools?.map((tool) => tool.name)
    assert.ok(names?.includes('memory_save') && names.includes('memory_forget'))

    const saved = await call('normal', 'memory_save', { texto: 'Viaja para Lisboa em dezembro' })
    assert.equal(saved.result?.isError, undefined)
    assert.equal(saved.result?.content?.[0].text, 'Anotado em MEMORIA.md.')
    assert.match(read(memory.path('memoria')), /Lisboa/)
    assert.equal(memory.notes()[0].title, 'Planos')

    const me = await call('normal', 'memory_save', { texto: 'A Ana é a irmã dele', onde: 'eu' })
    assert.equal(me.result?.content?.[0].text, 'Anotado em EU.md.')

    const secret = await call('normal', 'memory_save', { texto: 'senha: abc12345' })
    assert.equal(secret.result?.isError, true)

    const anonymous = await call('anonima', 'memory_save', { texto: 'Algo da conversa anônima' })
    assert.equal(anonymous.result?.isError, true)
    assert.match(anonymous.result?.content?.[0].text ?? '', /anônima/)
    const client = await call('cliente', 'memory_save', { texto: 'Algo do cliente' })
    assert.equal(client.result?.isError, true)
    const gone = await call('sumiu', 'memory_save', { texto: 'Algo' })
    assert.equal(gone.result?.isError, true)
    assert.doesNotMatch(read(memory.path('memoria')), /Algo/)

    const forgot = await call('normal', 'memory_forget', { texto: 'lisboa' })
    assert.equal(forgot.result?.content?.[0].text, 'Esqueci: Viaja para Lisboa em dezembro')
    const forgetAnonymous = await call('anonima', 'memory_forget', { texto: 'irmã', onde: 'eu' })
    assert.equal(forgetAnonymous.result?.isError, true)
    assert.match(read(memory.path('eu')), /irmã/)
  } finally {
    server.close()
  }
})

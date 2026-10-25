// A busca do histórico (Fase 29): sem acentos nem maiúsculas, no que foi dito (as suas mensagens
// e as respostas, com as edições aplicadas), com o trecho e a mensagem onde abrir; o índice no
// cache (só o usuário lê), relido só no que mudou, e a conversa apagada saindo dele na hora.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { HISTORY_DIR, History } from '../src/main/history'
import {
  checkTarget,
  messagesOf,
  SEARCH_FILE,
  SearchIndex,
  snippetOf
} from '../src/main/history-search'
import type { ChatEvent } from '../src/shared/ipc'
import { fold, foldMap, queryWords } from '../src/shared/fold'

test('dobrar: sem acentos e em minúsculas, sabendo onde cada letra estava', () => {
  assert.equal(fold('Ação É Ótima'), 'acao e otima')
  const { folded, at } = foldMap('Põe Ação')
  assert.equal(folded, 'poe acao')
  const start = folded.indexOf('acao')
  assert.equal('Põe Ação'.slice(at[start], at[start + 4]), 'Ação')
  assert.deepEqual(queryWords('  Café   com LEITE '), ['cafe', 'com', 'leite'])
  assert.deepEqual(queryWords('   '), [])
})

test('mensagens: as suas (contadas como a página conta) e os textos, depois das edições', () => {
  const events: ChatEvent[] = [
    { type: 'user', text: 'primeira', attachments: [] },
    { type: 'text', blockId: 'b1', delta: 'resposta um' },
    { type: 'turn-end', outcome: 'done' },
    // Só um anexo: não tem texto, mas conta como mensagem na página.
    { type: 'user', text: '', attachments: [{ name: 'foto.png', size: 1 }] },
    { type: 'text', blockId: 'b2', delta: 'vi a foto' },
    { type: 'turn-end', outcome: 'done' },
    { type: 'user', text: 'errada', attachments: [] },
    { type: 'text', blockId: 'b3', delta: 'sumiu' },
    { type: 'turn-end', outcome: 'done' },
    // A última foi editada: ela e a resposta saem; a nova entra no lugar.
    { type: 'rewind' },
    { type: 'user', text: 'certa', attachments: [] },
    { type: 'text', blockId: 'b4', delta: '   ' }
  ]
  assert.deepEqual(messagesOf(events), [
    { who: 'user', ref: 0, text: 'primeira' },
    { who: 'claude', ref: 'b1', text: 'resposta um' },
    { who: 'claude', ref: 'b2', text: 'vi a foto' },
    { who: 'user', ref: 2, text: 'certa' }
  ])
})

test('trecho: em volta do que bate, cortado nas palavras e sem a marcação', () => {
  const text =
    'Começo comprido de uma resposta que fala de muita coisa antes, e então a **Migração** do ' +
    'banco fica para sexta-feira, com o `pg_dump` antes e um teste da volta, que ninguém quer ' +
    'descobrir no dia que não funciona direito.'
  const snippet = snippetOf({ who: 'claude', ref: 'b1', text }, ['migracao', 'do', 'banco'])
  assert.ok(snippet)
  assert.equal(snippet.match, 'Migração')
  assert.ok(snippet.before.startsWith('…'))
  assert.ok(snippet.before.endsWith('a '), snippet.before)
  assert.ok(snippet.after.endsWith('…'))
  assert.ok(!snippet.after.includes('`') && !snippet.before.includes('**'))
  // A frase inteira, quando aparece junta.
  const phrase = snippetOf({ who: 'user', ref: 0, text: 'faz o backup do banco hoje' }, [
    'backup',
    'do',
    'banco'
  ])
  assert.equal(phrase?.match, 'backup do banco')
  assert.equal(phrase?.before, 'faz o ')
  assert.equal(snippetOf({ who: 'user', ref: 0, text: 'nada a ver' }, ['banco']), null)
})

test('o alvo vindo da página é conferido', () => {
  assert.deepEqual(checkTarget({ kind: 'user', n: 3, term: 'banco' }), {
    kind: 'user',
    n: 3,
    term: 'banco'
  })
  assert.deepEqual(checkTarget({ kind: 'text', id: 'b1', term: 'x', extra: 1 }), {
    kind: 'text',
    id: 'b1',
    term: 'x'
  })
  for (const bad of [
    null,
    'x',
    { kind: 'user', n: -1, term: 'a' },
    { kind: 'user', n: 1.5, term: 'a' },
    { kind: 'text', id: '', term: 'a' },
    { kind: 'text', id: 'b1', term: '  ' },
    { kind: 'text', id: 'b1', term: 'a'.repeat(301) },
    { kind: 'outro', id: 'b1', term: 'a' }
  ]) {
    assert.equal(checkTarget(bad), null, JSON.stringify(bad))
  }
})

/** Uma conversa gravada como o chat grava: a sua mensagem e a resposta, turno a turno. */
function conversation(turns: [string, string][]): string {
  const history = new History()
  const session = randomUUID()
  turns.forEach(([user, reply], index) => {
    history.user(session, user, [])
    history.record({ type: 'text', blockId: `${session}-${index}`, delta: reply })
    history.record({ type: 'turn-end', outcome: 'done' })
  })
  history.flush()
  return history.currentId()!
}

/** Espera o relógio andar (a lista ordena pela data do arquivo). */
function tick(): void {
  const before = Date.now()
  while (Date.now() - before < 5) {
    // Espera.
  }
}

test('busca: no que foi dito, sem acentos, com o trecho e onde abrir; o cache e o que mudou', () => {
  const nginx = conversation([
    ['Como configurar o nginx?', 'Um proxy reverso com o nginx, e o certbot para o HTTPS.'],
    ['E o firewall?', 'Libere as portas 80 e 443 no ufw.']
  ])
  tick()
  const banco = conversation([['Lembra da migração do banco?', 'Ficou para sexta, com backup.']])
  tick()
  const store = new History()
  const list = (): ReturnType<History['list']> => store.list()
  const index = new SearchIndex(store)

  // Uma palavra da resposta, sem o acento: acha, com o trecho e a mensagem do Claude.
  let hits = index.search('MIGRACAO', list())
  assert.deepEqual(
    hits.map((hit) => hit.id),
    [banco]
  )
  assert.equal(hits[0].snippet?.who, 'user')
  assert.equal(hits[0].snippet?.match, 'migração')
  assert.deepEqual(hits[0].at, { kind: 'user', n: 0, term: 'migração' })

  hits = index.search('certbot', list())
  assert.equal(hits[0].id, nginx)
  assert.equal(hits[0].snippet?.who, 'claude')
  // O bloco da primeira resposta, marcando a palavra.
  assert.equal(hits[0].at?.term, 'certbot')
  assert.ok(hits[0].at?.kind === 'text' && hits[0].at.id.endsWith('-0'))

  // As palavras podem estar em mensagens diferentes da mesma conversa; a melhor é a que tem mais.
  hits = index.search('ufw firewall', list())
  assert.equal(hits.length, 1)
  assert.equal(hits[0].matches, 2)
  hits = index.search('nginx sexta', list())
  assert.equal(hits.length, 0)
  // A busca vazia não acha nada (a lista é a de sempre).
  assert.deepEqual(index.search('   ', list()), [])
  // Só o título bate (uma conversa que o índice não tem mensagens): sem trecho.
  const fake = { ...list()[0], id: randomUUID(), title: 'Viagem a Ouro Preto' }
  hits = index.search('ouro', [fake])
  assert.equal(hits.length, 1)
  assert.equal(hits[0].snippet, null)
  assert.equal(hits[0].at, undefined)

  // O cache: gravado ao fechar, só para o usuário, e reaproveitado sem reler as conversas.
  index.dispose()
  assert.equal(SEARCH_FILE, join(HOME, '.cache/wisp/busca.json'))
  assert.equal(statSync(SEARCH_FILE).mode & 0o777, 0o600)
  assert.ok(readFileSync(SEARCH_FILE, 'utf8').includes('certbot'))
  const loads: string[] = []
  const spy = {
    load: (id: string) => {
      loads.push(id)
      return store.load(id)
    }
  }
  const again = new SearchIndex(spy)
  assert.equal(again.search('certbot', list())[0].id, nginx)
  assert.deepEqual(loads, [])

  // Uma conversa que mudou é relida, só ela.
  const reopened = new History()
  reopened.continue(store.load(banco)!)
  reopened.user(banco, 'E o rollback?', [])
  reopened.record({ type: 'text', blockId: 'rb', delta: 'Um pg_restore do backup de sexta.' })
  reopened.flush()
  hits = again.search('pg_restore', list())
  assert.deepEqual(
    hits.map((hit) => hit.id),
    [banco]
  )
  assert.deepEqual(hits[0].at, { kind: 'text', id: 'rb', term: 'pg_restore' })
  assert.deepEqual(loads, [banco])

  // Apagada: sai do cache na hora; e um arquivo que sumiu sai do índice na próxima busca.
  again.forget(banco)
  assert.ok(!readFileSync(SEARCH_FILE, 'utf8').includes('pg_restore'))
  unlinkSync(join(HISTORY_DIR, `${nginx}.jsonl`))
  assert.deepEqual(again.search('certbot', list()), [])
  again.dispose()
  assert.ok(!readFileSync(SEARCH_FILE, 'utf8').includes('certbot'))
})

test('busca: um cache estragado é refeito pelas conversas', () => {
  const id = conversation([['Receita de pão de queijo', 'Polvilho azedo, queijo e ovos.']])
  const store = new History()
  // O cache do teste anterior existe; aqui ele vira lixo.
  assert.ok(existsSync(SEARCH_FILE))
  writeFileSync(SEARCH_FILE, '{ isto não é json')
  const index = new SearchIndex(store)
  assert.equal(index.search('polvilho', store.list())[0].id, id)
  index.dispose()
  assert.equal(JSON.parse(readFileSync(SEARCH_FILE, 'utf8')).v, 1)
})

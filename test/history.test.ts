// O histórico das conversas (~/.local/share/wisp/conversas): gravar só o que importa, juntar o
// texto em pedaços, listar com títulos, reabrir, trocar de sessão e apagar. E o diff das edições.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { HISTORY_DIR, History, titleOf } from '../src/main/history'
import { buildDiff, compactHunks, diffFromInput, lineDiff } from '../src/shared/diff'

test('títulos: a primeira linha, ou os anexos', () => {
  assert.equal(titleOf('  Qual a capital?\nE da Itália?', []), 'Qual a capital?')
  assert.equal(titleOf('', [{ name: 'foto.png', size: 1 }]), 'foto.png')
  assert.equal(titleOf('', []), 'Conversa')
  assert.ok(titleOf('x'.repeat(500), []).length <= 80)
})

const A = randomUUID()
const B = randomUUID()
const COPY = randomUUID()

test('grava a conversa: o texto em pedaços vira um só, e o que não importa fica de fora', () => {
  assert.equal(HISTORY_DIR, join(HOME, '.local/share/wisp/conversas'))
  const history = new History()
  history.user(A, 'Oi, tudo bem?', [])
  history.record({ type: 'busy', busy: true })
  history.record({ type: 'text', blockId: 'b1', delta: 'Tudo ' })
  history.record({ type: 'text', blockId: 'b1', delta: 'certo.' })
  history.record({ type: 'turn-end', outcome: 'done' })
  history.flush()
  const id = history.currentId()
  assert.ok(id)
  const file = join(HISTORY_DIR, `${id}.jsonl`)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(statSync(HISTORY_DIR).mode & 0o777, 0o700)
  const saved = history.load(id!)
  assert.ok(saved)
  assert.equal(saved.title, 'Oi, tudo bem?')
  assert.equal(saved.sessionId, A)
  assert.deepEqual(
    saved.events.map((event) => event.type),
    ['user', 'text', 'turn-end']
  )
  const text = saved.events[1]
  assert.ok(text.type === 'text' && text.delta === 'Tudo certo.')
  assert.ok(!readFileSync(file, 'utf8').includes('"busy"'))
})

test('lista, reabre numa sessão nova (cópia) e apaga', () => {
  const second = new History()
  second.user(B, 'Outra conversa', [])
  second.record({ type: 'turn-end', outcome: 'done' })
  const list = second.list(new Set([second.currentId()!]))
  assert.equal(list.length, 2)
  assert.deepEqual(
    list.map((item) => [item.title, item.current]),
    [
      ['Outra conversa', true],
      ['Oi, tudo bem?', false]
    ]
  )
  const reopened = new History()
  const saved = reopened.load(list[1].id)!
  reopened.continue(saved)
  reopened.setSession(COPY)
  reopened.user(COPY, 'continuando', [])
  assert.equal(reopened.load(saved.id)?.sessionId, COPY)
  assert.equal(reopened.remove(saved.id), true)
  assert.equal(reopened.load(saved.id), null)
  assert.equal(readdirSync(HISTORY_DIR).length, 1)
})

test('conversa nova (reset) fecha a atual', () => {
  const history = new History()
  history.user(randomUUID(), 'primeira', [])
  const first = history.currentId()
  history.record({ type: 'reset' })
  assert.equal(history.currentId(), null)
  history.user(randomUUID(), 'segunda', [])
  assert.notEqual(history.currentId(), first)
})

test('diff: linhas iguais, removidas e acrescentadas, com as contagens', () => {
  const hunk = lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n')
  const diff = buildDiff([hunk])
  assert.equal(diff.added, 2)
  assert.equal(diff.removed, 1)
  assert.ok(
    compactHunks(
      lineDiff('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n', '1\n2\n3\n4\n5\nX\n7\n8\n9\n10\n'),
      1
    )[0].lines.length <= 4
  )
  const fromEdit = diffFromInput('Edit', {
    file_path: '/a.ts',
    old_string: 'x = 1',
    new_string: 'x = 2\ny = 3'
  })
  assert.ok(fromEdit)
  assert.equal(fromEdit.added, 2)
  assert.equal(fromEdit.removed, 1)
  assert.equal(diffFromInput('Bash', { command: 'ls' }), null)
})

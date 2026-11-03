// Revisar no fim do turno (Fase 42): o hook guarda a cópia de antes da primeira edição de cada
// arquivo (e não a troca nas seguintes), o card compara com o de agora (o novo, o mudado e o
// apagado, com o diff do arquivo inteiro), e o desfazer volta o arquivo, só se ele ainda estiver
// como o card mostrou e o card for o do último turno.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { TurnReviews } from '../src/main/turn-review'
import {
  editedPath,
  readSnapshots,
  runSnapshotHook,
  SNAPSHOT_ENV,
  snapshotFile
} from '../src/main/turn-snapshot'
import { wholeFileDiff } from '../src/shared/diff'
import type { ChatEvent } from '../src/shared/ipc'

const work = join(HOME, 'projeto')
mkdirSync(work, { recursive: true })
const snaps = join(HOME, 'copias')
const dirOf = (conversation: string): string => join(snaps, conversation)

const hook = (tool: string, input: Record<string, unknown>, dir: string): void =>
  runSnapshotHook(
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: tool,
      tool_input: input,
      cwd: work
    }),
    { [SNAPSHOT_ENV]: dir }
  )

test('o caminho da edição: das ferramentas de edição, relativo à pasta da sessão', () => {
  assert.equal(
    editedPath({ tool_name: 'Edit', tool_input: { file_path: '/a/b.ts' }, cwd: '/x' }),
    '/a/b.ts'
  )
  assert.equal(
    editedPath({ tool_name: 'Write', tool_input: { file_path: 'src/c.ts' }, cwd: resolve('/x') }),
    resolve('/x', 'src/c.ts')
  )
  assert.equal(
    editedPath({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '/n.ipynb' } }),
    '/n.ipynb'
  )
  assert.equal(editedPath({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }), null)
  assert.equal(editedPath({ tool_name: 'Write', tool_input: { file_path: 'rel.ts' } }), null)
})

test('a cópia de antes: a primeira edição do turno, e um arquivo novo conta como "não existia"', () => {
  const dir = join(snaps, 'copia')
  const file = join(work, 'a.txt')
  writeFileSync(file, 'um\n')
  hook('Edit', { file_path: file }, dir)
  writeFileSync(file, 'dois\n')
  // A segunda edição do mesmo arquivo não troca a cópia.
  hook('Edit', { file_path: file }, dir)
  hook('Write', { file_path: 'novo.txt' }, dir)
  // Sem a pasta no ambiente (outra sessão), nada.
  runSnapshotHook(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }), {})
  const list = readSnapshots(dir)
  assert.deepEqual(
    list.map((s) => [s.path, s.existed, s.original?.toString()]),
    [
      [file, true, 'um\n'],
      [join(work, 'novo.txt'), false, undefined]
    ]
  )
  // Um caminho relativo direto não serve.
  snapshotFile(dir, 'relativo.txt')
  assert.equal(readSnapshots(dir).length, 2)
})

test('o diff do arquivo inteiro: só a parte que mudou, com o número da linha', () => {
  const before = Array.from({ length: 2000 }, (_, i) => `linha ${i + 1}`).join('\n') + '\n'
  const after = before.replace('linha 1000\n', 'linha mil\n')
  const diff = wholeFileDiff(before, after)
  assert.equal(diff.added, 1)
  assert.equal(diff.removed, 1)
  assert.equal(diff.hunks.length, 1)
  assert.equal(diff.hunks[0].oldStart, 997)
  assert.deepEqual(diff.hunks[0].lines, [
    ' linha 997',
    ' linha 998',
    ' linha 999',
    '-linha 1000',
    '+linha mil',
    ' linha 1001',
    ' linha 1002',
    ' linha 1003'
  ])
  assert.deepEqual(wholeFileDiff('', 'a\nb\n').added, 2)
})

test('o card do fim do turno e o desfazer', () => {
  const reviews = new TurnReviews(dirOf)
  const c = 'conversa-1'
  const user = { type: 'busy', busy: true } as ChatEvent
  const end = { type: 'turn-end', outcome: 'done' } as ChatEvent
  const changed = join(work, 'mudado.txt')
  const created = join(work, 'criado.txt')
  const removed = join(work, 'apagado.txt')
  const same = join(work, 'igual.txt')
  writeFileSync(changed, 'a\nb\nc\n')
  writeFileSync(removed, 'some\n')
  writeFileSync(same, 'fica\n')
  assert.equal(reviews.onEvent(c, user), null)
  // As edições do turno (o hook antes de cada uma).
  hook('Edit', { file_path: changed }, dirOf(c))
  writeFileSync(changed, 'a\nB\nc\n')
  hook('Write', { file_path: created }, dirOf(c))
  writeFileSync(created, 'novo\n')
  hook('Write', { file_path: removed }, dirOf(c))
  unlinkSync(removed)
  // Editado e voltado ao que era: não aparece.
  hook('Edit', { file_path: same }, dirOf(c))
  // Uma mensagem no meio da resposta não muda o busy: o mesmo turno (as cópias ficam).
  assert.equal(reviews.onEvent(c, user), null)
  const review = reviews.onEvent(c, end)
  assert.ok(review && review.type === 'turn-review')
  assert.equal(review.turn, 1)
  assert.deepEqual(
    review.files.map((f) => [f.path, f.status, f.added, f.removed, f.canUndo]),
    [
      [removed, 'deleted', 0, 1, true],
      [created, 'created', 1, 0, true],
      [changed, 'modified', 1, 1, true]
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  )
  const byPath = new Map(review.files.map((f) => [f.path, f]))
  // Mudado depois do card: o desfazer não mexe nele.
  writeFileSync(changed, 'a\nB\nc\nd\n')
  const first = reviews.undo(c, 1, [byPath.get(changed)!])
  assert.deepEqual(first.undone, [])
  assert.match(first.problems[0], /mudou depois da resposta/)
  writeFileSync(changed, 'a\nB\nc\n')
  const all = reviews.undo(c, 1, [...byPath.values()])
  assert.deepEqual(all.undone.sort(), [changed, created, removed].sort())
  assert.equal(readFileSync(changed, 'utf8'), 'a\nb\nc\n')
  assert.equal(existsSync(created), false)
  assert.equal(readFileSync(removed, 'utf8'), 'some\n')
  // Um turno novo: as cópias do anterior saem, e o card velho não desfaz mais.
  reviews.onEvent(c, user)
  assert.equal(readSnapshots(dirOf(c)).length, 0)
  const stale = reviews.undo(c, 1, [byPath.get(changed)!])
  assert.match(stale.problems[0], /já passou/)
  // Um turno sem edições não tem card.
  assert.equal(reviews.onEvent(c, end), null)
  // Desligado, também não.
  const off = new TurnReviews(dirOf, () => false)
  off.onEvent('c2', user)
  hook('Edit', { file_path: changed }, dirOf('c2'))
  writeFileSync(changed, 'x\n')
  assert.equal(off.onEvent('c2', end), null)
})

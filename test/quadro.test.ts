// O quadro de tarefas (Fase 51), com o git de verdade: um cartão começa numa cópia do projeto,
// com o pedido mandado à conversa nova; vai para Revisar quando a resposta acaba (ou quando a aba
// fecha); Juntar leva a mudança para a pasta original e o cartão para Feito; Descartar tira a
// cópia e o cartão volta para A fazer; os cartões ficam no arquivo, e um que rodava quando o Wisp
// fechou volta em Revisar.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { Board, readBoard } from '../src/main/board'
import type { BoardHost } from '../src/main/board'
import type { Conversation } from '../src/main/conversation'
import { gitRunner, Worktrees } from '../src/main/worktrees'
import type { BoardCard } from '../src/shared/ipc'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

const original = join(HOME, 'projeto-quadro')
mkdirSync(original, { recursive: true })
git(original, 'init', '-q', '-b', 'main')
git(original, 'config', 'user.email', 'teste@exemplo.com')
git(original, 'config', 'user.name', 'Teste')
git(original, 'config', 'core.autocrlf', 'false')
writeFileSync(join(original, 'app.ts'), 'const a = 1\n')
git(original, 'add', '.')
git(original, 'commit', '-q', '-m', 'início')

/** Uma conversa de mentira: guarda o que foi mandado e diz se está ocupada. */
interface FakeConversation {
  id: string
  folder: string
  busy: boolean
  sent: string[]
  shown: string[]
}

function host(): { host: BoardHost; opened: FakeConversation[]; closed: string[] } {
  const opened: FakeConversation[] = []
  const apis = new Map<string, Conversation>()
  const closed: string[] = []
  const tabs = {
    full: false,
    conversationById: (id: string) => (closed.includes(id) ? undefined : apis.get(id)),
    show: () => undefined,
    close: (id: string) => closed.push(id)
  }
  return {
    opened,
    closed,
    host: {
      tabs: tabs as unknown as BoardHost['tabs'],
      worktrees: new Worktrees(
        gitRunner('git'),
        join(HOME, 'copias-quadro'),
        join(HOME, 'copias-quadro.json')
      ),
      open: (folder) => {
        const conversation: FakeConversation = {
          id: `c${opened.length + 1}`,
          folder,
          busy: false,
          sent: [],
          shown: []
        }
        const api = {
          ...conversation,
          get busy() {
            return conversation.busy
          },
          history: { events: () => [] },
          showUser: (text: string) => conversation.shown.push(text),
          send: (text: string) => {
            conversation.sent.push(text)
            return true
          }
        }
        opened.push(conversation)
        apis.set(conversation.id, api as unknown as Conversation)
        return api as unknown as Conversation
      },
      show: () => undefined
    }
  }
}

const file = join(HOME, 'quadro.json')

test('quadro: começar numa cópia, revisar, juntar e descartar', async () => {
  const { host: h, opened } = host()
  const changes: BoardCard[][] = []
  const board = new Board(h, (cards) => changes.push(cards), file)
  assert.equal(board.add('', 'x', original).ok, false)
  assert.equal(board.add('Título', 'faça', join(HOME, 'nao-existe')).ok, false)
  assert.equal(board.add('Modo escuro', 'Adicione um modo escuro.', original).ok, true)
  const [card] = board.list()
  assert.equal(card.column, 'todo')

  // Começar: a cópia, a conversa nela e o pedido mandado.
  assert.equal((await board.start(card.id)).ok, true)
  const running = board.list()[0]
  assert.equal(running.column, 'running')
  assert.ok(running.copy && existsSync(join(running.copy, 'app.ts')))
  assert.equal(opened[0].folder, running.copy)
  assert.deepEqual(opened[0].sent, ['Adicione um modo escuro.'])
  assert.deepEqual(opened[0].shown, ['Adicione um modo escuro.'])

  // Trabalhando: fica em Rodando; a resposta acabou: Revisar.
  opened[0].busy = true
  board.tick()
  assert.equal(board.list()[0].column, 'running')
  writeFileSync(join(running.copy as string, 'app.ts'), 'const a = 2\n')
  opened[0].busy = false
  board.tick()
  assert.equal(board.list()[0].column, 'review')

  // Juntar: a mudança vai para a pasta original, sem commit; o cartão vai para Feito.
  const joined = await board.join(card.id)
  assert.equal(joined.ok, true, joined.message)
  assert.equal(readFileSync(join(original, 'app.ts'), 'utf8'), 'const a = 2\n')
  assert.equal(board.list()[0].column, 'done')
  // Com a cópia ainda lá, o cartão não sai (junte ou descarte antes).
  assert.equal(board.remove(card.id).ok, false)

  // Descartar: a cópia sai, e o cartão volta para A fazer.
  const discarded = await board.discard(card.id)
  assert.equal(discarded.ok, true, discarded.message)
  assert.equal(existsSync(running.copy as string), false)
  assert.equal(board.list()[0].column, 'todo')
  assert.equal(board.list()[0].copy, undefined)
  assert.equal(board.remove(card.id).ok, true)
  assert.equal(board.list().length, 0)
  assert.ok(changes.length > 0)
  git(original, 'checkout', '--', 'app.ts')
})

test('quadro: a aba fechada vai para Revisar, e o arquivo guarda os cartões', async () => {
  const { host: h, closed } = host()
  const board = new Board(h, () => undefined, file)
  board.add('Testes', 'Escreva os testes.', original)
  const [card] = board.list()
  await board.start(card.id)
  closed.push(board.list()[0].conversation as string)
  board.tick()
  assert.equal(board.list()[0].column, 'review')
  // Um cartão rodando quando o Wisp fechou volta em Revisar.
  const saved = readBoard(file)
  saved[0].column = 'running'
  writeFileSync(file, JSON.stringify(saved))
  const reopened = new Board(host().host, () => undefined, file)
  assert.equal(reopened.list()[0].column, 'review')
  assert.equal((await reopened.discard(card.id)).ok, true)
})

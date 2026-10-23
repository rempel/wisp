// Desempenho e consumo (Fase 23): a aba parada dorme (o processo do Claude Code sai) e acorda
// na mesma sessão, com o Claude de mentira lembrando o que veio antes; e o que impede de dormir
// (trabalhando, uma tarefa em segundo plano, sem processo).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ClaudeSession } from '../src/main/claude'
import type { ChatEvent } from '../src/shared/ipc'
import { FIXTURES } from './helpers/paths'

const CLI = join(FIXTURES, 'fake-claude')
const WORK = join(HOME, 'workspace')
mkdirSync(WORK, { recursive: true })

const opened: ClaudeSession[] = []
after(() => {
  for (const claude of opened) claude.dispose()
})

function session(): { claude: ClaudeSession; events: ChatEvent[] } {
  const events: ChatEvent[] = []
  const claude = new ClaudeSession(
    {
      claudePath: CLI,
      workspace: () => WORK,
      allowedTools: ['Read'],
      appendSystemPrompt: 'persona',
      permissionMode: 'default',
      model: null
    },
    (event) => events.push(event)
  )
  opened.push(claude)
  return { claude, events }
}

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() - start > ms) throw new Error('o tempo acabou')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

async function turn(claude: ClaudeSession, events: ChatEvent[], message: string) {
  const from = events.length
  await claude.send(message)
  await waitFor(() => events.slice(from).some((event) => event.type === 'busy' && !event.busy))
  return events
    .slice(from)
    .map((event) => (event.type === 'text' ? event.delta : ''))
    .join('')
}

const spawns = (): string[][] =>
  readFileSync(join(HOME, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => (JSON.parse(line) as { args: string[] }).args)

/** O processo ainda existe? */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('dormir: o processo sai, e a próxima mensagem retoma a mesma sessão', async () => {
  const { claude, events } = session()
  assert.equal(claude.sleep(), false, 'sem processo, não há o que dormir')
  await turn(claude, events, 'primeira')
  const pid = (
    JSON.parse(
      readFileSync(join(HOME, '.fake-claude/spawns.log'), 'utf8').trim().split('\n').at(-1)!
    ) as { pid: number }
  ).pid
  const id = claude.ensureSessionId()
  const before = spawns().length
  assert.ok(claude.idleFor(Date.now() + 1000) >= 1000)
  assert.equal(claude.sleep(), true)
  assert.equal(claude.asleep, true)
  assert.equal(claude.idleFor(), 0, 'sem processo, nada para dormir de novo')
  await waitFor(() => !alive(pid))
  const answer = await turn(claude, events, 'segunda [memória]')
  assert.equal(claude.asleep, false)
  assert.match(answer, /Lembro de: primeira \| segunda \[memória\]/)
  const args = spawns().at(-1)!
  assert.equal(spawns().length, before + 1, 'subiu outro processo')
  assert.equal(args[args.indexOf('--resume') + 1], id)
  assert.ok(!args.includes('--fork-session'))
  // Nenhum aviso de erro: dormir não é uma queda.
  assert.ok(!events.some((event) => event.type === 'notice' && event.level === 'error'))
})

test('dormir: trabalhando ou com uma tarefa em segundo plano, não', async () => {
  const { claude, events } = session()
  await turn(claude, events, 'primeira')
  void claude.send('demora [lento]')
  await waitFor(() => claude.isBusy())
  assert.equal(claude.idleFor(), 0)
  assert.equal(claude.sleep(), false)
  claude.stop()
  await waitFor(() => !claude.isBusy())
  // Uma tarefa em segundo plano (um servidor que o Claude subiu) morreria junto.
  await turn(claude, events, 'sobe [tarefa]')
  assert.equal(claude.sleep(), false, 'com a tarefa rodando')
  await waitFor(
    () => events.some((event) => event.type === 'task' && event.task.status === 'completed'),
    6000
  )
  assert.equal(claude.sleep(), true, 'a tarefa acabou: agora dorme')
})

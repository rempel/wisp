// As tarefas por evento (Fase 44): cada gatilho roda só as tarefas dele (ligadas), no máximo uma
// vez a cada 5 minutos; o {evento} entra no prompt; as tarefas do horário continuam no agendador
// e as de um evento ficam fora dele; um arquivo novo numa pasta roda a tarefa daquela pasta, com os
// arquivos que chegaram juntos numa rodada só, sem os que já estavam lá e sem os que ainda baixam;
// e os alertas do GitHub viram o gatilho certo.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubTrigger, TaskTriggers, TRIGGER_COOLDOWN_MS } from '../src/main/tasks-setup'
import { expandPrompt, lastDue, nextRun } from '../src/shared/prompts'
import type { ScheduledTask } from '../src/shared/prompts'

const task = (id: string, patch: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  name: id,
  prompt: 'Veja: {evento}',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
  folder: null,
  enabled: true,
  ...patch
})

test('o {evento} no prompt, e as tarefas de um evento fora do agendador', () => {
  const values = { folder: '~', clipboard: '', date: 'hoje', time: 'agora' }
  assert.equal(expandPrompt('Veja: {evento}', { ...values, event: 'o PR 7' }), 'Veja: o PR 7')
  assert.equal(expandPrompt('See: {event}', values), 'See: ')
  const monday = new Date(2026, 10, 2, 8, 0)
  assert.ok(nextRun(task('a'), monday))
  assert.equal(nextRun(task('b', { trigger: 'unlock' }), monday), null)
  assert.equal(lastDue(task('c', { trigger: 'pr-review' }), new Date(2026, 10, 2, 10, 0)), null)
})

test('um gatilho roda só as tarefas dele, ligadas, uma vez a cada 5 minutos', () => {
  let now = 0
  const ran: [string, string][] = []
  const tasks = [
    task('ci', { trigger: 'ci-failed' }),
    task('ci-off', { trigger: 'ci-failed', enabled: false }),
    task('revisao', { trigger: 'pr-review' }),
    task('horario')
  ]
  const triggers = new TaskTriggers({
    tasks: () => tasks,
    run: (t, event) => ran.push([t.id, event]),
    now: () => now
  })
  assert.equal(triggers.fire('ci-failed', 'CI 1'), 1)
  assert.deepEqual(ran, [['ci', 'CI 1']])
  now += TRIGGER_COOLDOWN_MS - 1
  assert.equal(triggers.fire('ci-failed', 'CI 2'), 0)
  now += 2
  triggers.fire('ci-failed', 'CI 3')
  triggers.fire('pr-review', 'revisão')
  assert.deepEqual(ran, [
    ['ci', 'CI 1'],
    ['ci', 'CI 3'],
    ['revisao', 'revisão']
  ])
})

test('um arquivo novo numa pasta: os que chegam juntos numa rodada, sem os de antes nem os baixando', async () => {
  const files = new Map<string, string[]>([['/casa/Downloads', ['antigo.pdf']]])
  const watchers: Record<string, () => void> = {}
  const ran: [string, string][] = []
  const tasks = [
    task('downloads', { trigger: 'new-file', watch: '/casa/Downloads' }),
    task('outra', { trigger: 'new-file', watch: '/casa/Outra' })
  ]
  const triggers = new TaskTriggers({
    tasks: () => tasks,
    run: (t, event) => ran.push([t.id, event]),
    list: (dir) => {
      const list = files.get(dir)
      if (!list) throw new Error('não existe')
      return list
    },
    watch: (dir, onChange) => {
      watchers[dir] = onChange
      return { close: () => delete watchers[dir] }
    }
  })
  triggers.refreshFolders()
  assert.deepEqual(
    Object.keys(watchers),
    ['/casa/Downloads'],
    'a pasta que não existe fica de fora'
  )
  files.set('/casa/Downloads', ['antigo.pdf', 'nota.pdf', 'video.mp4.part'])
  watchers['/casa/Downloads']()
  files.set('/casa/Downloads', ['antigo.pdf', 'nota.pdf', 'video.mp4.part', 'foto.png'])
  watchers['/casa/Downloads']()
  await new Promise((resolve) => setTimeout(resolve, 3200))
  assert.equal(ran.length, 1)
  assert.equal(ran[0][0], 'downloads')
  assert.match(ran[0][1], /2 arquivos novos em \/casa\/Downloads/)
  assert.match(ran[0][1], /nota\.pdf/)
  assert.match(ran[0][1], /foto\.png/)
  assert.doesNotMatch(ran[0][1], /antigo|\.part/)
  // A tarefa saiu: a pasta deixa de ser acompanhada.
  tasks.splice(0, 1)
  triggers.refreshFolders()
  assert.deepEqual(Object.keys(watchers), [])
  triggers.dispose()
})

test('os alertas do GitHub viram o gatilho certo', () => {
  const pr = {
    repo: 'eu/app',
    number: 7,
    title: 'Conserta o login',
    url: 'https://github.com/eu/app/pull/7',
    draft: false,
    decision: null,
    ci: 'failure' as const,
    head: 'a1'
  }
  const ci = githubTrigger({ kind: 'ci-failed', pr } as never)
  assert.equal(ci?.trigger, 'ci-failed')
  assert.match(
    ci?.event ?? '',
    /O CI falhou: eu\/app#7: Conserta o login \(https:\/\/github\.com\/eu\/app\/pull\/7\)/
  )
  const review = githubTrigger({ kind: 'review', pr, author: 'bia', state: 'COMMENTED' } as never)
  assert.equal(review?.trigger, 'pr-review')
  assert.equal(githubTrigger({ kind: 'ci-passed', pr } as never), null)
})

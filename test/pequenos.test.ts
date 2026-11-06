// Os pequenos (Fase 52): as horas de silêncio (inclusive as que passam da meia-noite), a versão
// que abriu da última vez (as notas depois de atualizar), o resumo em imagem só com contagens, e os
// avisos do GitLab: o pipeline dos merge requests, o que muda vira o aviso de sempre, com o "!"
// do GitLab e o pedido de investigar pelo glab.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { inQuietHours } from '../src/main/focus'
import { describeAlert, diffSnapshots, investigatePrompt } from '../src/main/github'
import { gitlabSnapshot, mrOf, parseGitlab, pipelineState } from '../src/main/gitlab'
import { notesUrl, updatedFrom } from '../src/main/updates-setup'
import { weekImageLines } from '../src/renderer/chat/week-image'
import type { WeekSummary } from '../src/shared/ipc'

const at = (h: number, m = 0): Date => new Date(2026, 10, 6, h, m)

test('silêncio: dentro e fora do horário', () => {
  const night = { from: '22:00', to: '08:00' }
  assert.equal(inQuietHours(night, at(23)), true)
  assert.equal(inQuietHours(night, at(3)), true)
  assert.equal(inQuietHours(night, at(7, 59)), true)
  assert.equal(inQuietHours(night, at(8)), false)
  assert.equal(inQuietHours(night, at(15)), false)
  const lunch = { from: '12:00', to: '13:30' }
  assert.equal(inQuietHours(lunch, at(12, 45)), true)
  assert.equal(inQuietHours(lunch, at(13, 30)), false)
  assert.equal(inQuietHours(null, at(23)), false)
  assert.equal(inQuietHours({ from: '10:00', to: '10:00' }, at(10)), false)
  assert.equal(inQuietHours({ from: '25:00', to: '08:00' }, at(3)), false)
})

test('notas da versão: só depois de atualizar (não na primeira vez, nem voltando)', () => {
  const file = join(HOME, 'ultima-versao.txt')
  assert.equal(updatedFrom('1.0.0', file), null)
  assert.equal(updatedFrom('1.0.0', file), null)
  assert.equal(updatedFrom('1.1.0', file), '1.0.0')
  assert.equal(updatedFrom('1.1.0', file), null)
  // Uma versão mais velha (voltou de uma de teste) não avisa.
  assert.equal(updatedFrom('1.0.5', file), null)
  assert.equal(notesUrl('1.1.0'), 'https://github.com/rempel/wisp/releases/tag/v1.1.0')
})

test('resumo em imagem: só as contagens', () => {
  const week = {
    from: 0,
    to: 1,
    conversations: 12,
    turns: 40,
    claudeMinutes: 95,
    stopped: 0,
    errors: 0,
    edits: 8,
    added: 120,
    removed: 30,
    approved: 7,
    denied: 1,
    tools: [['Edit', 9]],
    apps: [['Firefox', 2]],
    terminal: 3,
    projects: [['segredo', 3]],
    reminders: 0
  } satisfies WeekSummary as WeekSummary
  const lines = weekImageLines(week)
  assert.deepEqual(
    lines.map((line) => line.value),
    ['12', '1 h 35 min', '+120 −30', '7']
  )
  assert.equal(JSON.stringify(lines).includes('segredo'), false)
  assert.equal(JSON.stringify(lines).includes('Firefox'), false)
})

const raw = (iid: number, status: string | null, sha = 'aaa') => ({
  iid,
  project_id: 5,
  title: `MR ${iid}`,
  web_url: `https://gitlab.com/time/app/-/merge_requests/${iid}`,
  sha,
  references: { full: `time/app!${iid}` },
  head_pipeline: status ? { status, sha } : null
})

test('gitlab: o pipeline de cada merge request', async () => {
  assert.equal(pipelineState('failed'), 'failure')
  assert.equal(pipelineState('running'), 'pending')
  assert.equal(pipelineState('success'), 'success')
  assert.equal(pipelineState('canceled'), 'none')
  assert.equal(mrOf({ iid: 1, web_url: 'http://inseguro' }), null)
  const asked: string[] = []
  const api = async (path: string): Promise<unknown> => {
    asked.push(path)
    if (path === 'user') return { username: 'eu' }
    if (path.startsWith('merge_requests')) return [raw(1, null), raw(2, null)]
    return path.endsWith('/1') ? raw(1, 'failed') : raw(2, 'running')
  }
  const snapshot = await gitlabSnapshot('glab', api, 1000)
  assert.equal(snapshot.login, 'eu')
  assert.deepEqual(
    snapshot.mine.map((mr) => [mr.repo, mr.number, mr.ci, mr.host]),
    [
      ['time/app', 1, 'failure', 'gitlab'],
      ['time/app', 2, 'pending', 'gitlab']
    ]
  )
  assert.ok(asked.includes('projects/5/merge_requests/1'))
  assert.ok(parseGitlab(snapshot))
  assert.equal(parseGitlab({ login: '', mine: [] }), null)

  // De uma leitura para a outra: o 2 falhou; o aviso usa o "!" e o glab.
  const after = {
    ...snapshot,
    mine: [snapshot.mine[0], { ...snapshot.mine[1], ci: 'failure' as const }]
  }
  const alerts = diffSnapshots(snapshot, after)
  assert.equal(alerts.length, 1)
  assert.equal(describeAlert(alerts[0]).body, 'time/app!2: MR 2')
  const prompt = investigatePrompt(alerts[0]) ?? ''
  assert.match(prompt, /pipeline do merge request time\/app!2/)
  assert.match(prompt, /glab ci view -R time\/app/)
})

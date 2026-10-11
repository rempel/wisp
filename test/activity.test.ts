// O resumo da semana: o que os eventos das conversas viram no registro (só contagens e nomes,
// nada do conteúdo), a semana de segunda a segunda no fuso local, as contas, o texto comparado
// com a semana anterior e a poda das semanas velhas.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  ActivityLog,
  describeWeek,
  formatMinutes,
  isEmpty,
  nextWeek,
  summarize,
  toolName,
  weekStart
} from '../src/main/activity'
import type { ActivityEntry } from '../src/main/activity'

test('o nome curto das ferramentas', () => {
  assert.equal(toolName('mcp__desktop__open_app'), 'open_app')
  assert.equal(toolName('mcp__playwright__browser_navigate'), 'navegador')
  assert.equal(toolName('Bash'), 'Bash')
})

test('a semana vai de segunda 0h a segunda 0h, no fuso local', () => {
  // Quarta, 14/10/2026, 15h em São Paulo.
  const wednesday = new Date(2026, 9, 14, 15).getTime()
  assert.equal(weekStart(wednesday), new Date(2026, 9, 12).getTime())
  assert.equal(weekStart(new Date(2026, 9, 12, 0, 0).getTime()), new Date(2026, 9, 12).getTime())
  assert.equal(weekStart(new Date(2026, 9, 18, 23, 59).getTime()), new Date(2026, 9, 12).getTime())
  assert.equal(nextWeek(new Date(2026, 9, 12).getTime()), new Date(2026, 9, 19).getTime())
})

test('dos eventos das conversas para o registro: só contagens e nomes', () => {
  const path = join(HOME, 'atividade-1.jsonl')
  let now = 1_000_000
  const log = new ActivityLog(path, { enabled: () => true, now: () => now })
  log.onChatEvent({ type: 'busy', busy: true }, 'a')
  log.onChatEvent({ type: 'tool-start', id: 't1', name: 'Bash' }, 'a')
  log.onChatEvent(
    {
      type: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: { command: 'rm -rf segredo' }
    },
    'a'
  )
  log.onChatEvent({ type: 'permission-resolved', id: 'p1', decision: 'deny' }, 'a')
  log.onChatEvent({ type: 'tool-start', id: 't2', name: 'Edit' }, 'a')
  log.onChatEvent(
    {
      type: 'tool-result',
      id: 't2',
      isError: false,
      output: 'conteúdo do arquivo secreto',
      diff: { added: 5, removed: 2, hunks: [], truncated: false }
    },
    'a'
  )
  log.onChatEvent({ type: 'tool-start', id: 't3', name: 'mcp__desktop__open_app' }, 'a')
  log.onChatEvent(
    { type: 'tool-input', id: 't3', name: 'mcp__desktop__open_app', input: { id: 'firefox' } },
    'a'
  )
  log.onChatEvent(
    { type: 'permission-request', id: 'p2', toolName: 'mcp__desktop__open_app', input: {} },
    'a'
  )
  log.onChatEvent({ type: 'permission-resolved', id: 'p2', decision: 'allow-always' }, 'a')
  log.onChatEvent({ type: 'tool-result', id: 't3', isError: false, output: 'aberto' }, 'a')
  now += 90_000
  log.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'a')
  // A segunda mensagem da mesma conversa não é uma conversa nova; depois do reset, é.
  log.onChatEvent({ type: 'busy', busy: true }, 'a')
  log.onChatEvent({ type: 'turn-end', outcome: 'stopped' }, 'a')
  log.onChatEvent({ type: 'reset' }, 'a')
  log.onChatEvent({ type: 'busy', busy: true }, 'a')
  log.onChatEvent({ type: 'turn-end', outcome: 'error' }, 'a')
  log.record({ k: 'terminal', projeto: 'wisp' })
  log.record({ k: 'lembrete' })

  const text = readFileSync(path, 'utf8')
  assert.doesNotMatch(text, /segredo|conteúdo|rm -rf/, 'nada do conteúdo vai para o registro')
  assert.equal((statSync(path).mode & 0o777).toString(8), '600')
  const s = summarize(log.entries(0, Infinity), 0, Infinity)
  assert.deepEqual(
    {
      conversations: s.conversations,
      turns: s.turns,
      claudeMinutes: s.claudeMinutes,
      stopped: s.stopped,
      errors: s.errors,
      edits: s.edits,
      added: s.added,
      removed: s.removed,
      approved: s.approved,
      denied: s.denied,
      apps: s.apps,
      terminal: s.terminal,
      projects: s.projects,
      reminders: s.reminders
    },
    {
      conversations: 2,
      turns: 3,
      claudeMinutes: 2,
      stopped: 1,
      errors: 1,
      edits: 1,
      added: 5,
      removed: 2,
      approved: 1,
      denied: 1,
      apps: [['firefox', 1]],
      terminal: 1,
      projects: [['wisp', 1]],
      reminders: 1
    }
  )
  assert.deepEqual(s.tools, [
    ['Bash', 1],
    ['Edit', 1],
    ['open_app', 1]
  ])
})

test('desligado, nada é registrado', () => {
  const path = join(HOME, 'atividade-2.jsonl')
  const log = new ActivityLog(path, { enabled: () => false })
  log.onChatEvent({ type: 'busy', busy: true }, 'a')
  log.record({ k: 'lembrete' })
  assert.deepEqual(log.entries(0, Infinity), [])
})

test('a poda tira o que tem mais de 9 semanas; uma linha estragada não estraga o resto', () => {
  const path = join(HOME, 'atividade-3.jsonl')
  const now = Date.parse('2026-10-14T12:00:00Z')
  const old = now - 10 * 7 * 86_400_000
  writeFileSync(
    path,
    [
      JSON.stringify({ t: old, k: 'lembrete' }),
      '{estragada',
      JSON.stringify({ t: now - 86_400_000, k: 'lembrete' })
    ].join('\n') + '\n'
  )
  const log = new ActivityLog(path, { enabled: () => true, now: () => now })
  assert.equal(log.entries(0, Infinity).length, 2)
  log.prune()
  assert.deepEqual(log.entries(0, Infinity), [{ t: now - 86_400_000, k: 'lembrete' }])
})

test('o texto do resumo, comparado com a semana anterior', () => {
  const from = new Date(2026, 9, 12).getTime()
  const to = nextWeek(from)
  const at = (d: number): number => new Date(2026, 9, d, 10).getTime()
  const entries: ActivityEntry[] = [
    { t: at(12), k: 'conversa' },
    { t: at(12), k: 'turno', ms: 45 * 60_000, fim: 'done' },
    { t: at(13), k: 'conversa' },
    { t: at(13), k: 'turno', ms: 40 * 60_000, fim: 'done' },
    { t: at(13), k: 'edicao', mais: 120, menos: 30 },
    { t: at(13), k: 'ferramenta', nome: 'Edit' },
    { t: at(13), k: 'permissao', ok: true, nome: 'Bash' },
    { t: at(14), k: 'terminal', projeto: 'wisp' }
  ]
  const week = summarize(entries, from, to)
  const before = summarize([{ t: at(6), k: 'conversa' }], from - 7 * 86_400_000, from)
  assert.equal(formatMinutes(week.claudeMinutes), '1 h 25 min')
  assert.equal(
    describeWeek(week, before),
    [
      'Semana de 12/10 a 18/10:',
      '- 2 conversas (+1), 2 mensagens; o Claude trabalhou 1 h 25 min (antes: menos de 1 min)',
      '- Edições: 1 (+120 −30 linhas)',
      '- Permissões: 1 aprovadas, 0 negadas',
      '- Ferramentas mais usadas: Edit (1)',
      '- Terminal: 1 mensagens no Claude Code, em wisp (1)'
    ].join('\n')
  )
  assert.equal(isEmpty(summarize([], from, to)), true)
  assert.equal(isEmpty(week), false)
})

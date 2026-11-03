// O aviso do uso do plano (Fase 41): uma vez por degrau (80% e 95%) em cada janela, de novo quando
// ela reinicia, nada com o limite já atingido ou desligado, e sem repetir ao abrir o Wisp de novo.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeUsage, UsageAlerts } from '../src/main/usage-alerts'
import type { ToldState, UsageAlert } from '../src/main/usage-alerts'
import type { PlanUsage } from '../src/shared/ipc'

const usage = (session: number | null, week: number | null, resets = 1000): PlanUsage => ({
  session: session === null ? null : { used: session, resetsAt: resets },
  week: week === null ? null : { used: week, resetsAt: 9000 },
  limited: false,
  at: 0
})

test('o aviso do plano: uma vez por degrau, e de novo quando a janela reinicia', () => {
  const alerts: UsageAlert[] = []
  let saved: ToldState = {}
  const watcher = new UsageAlerts({
    enabled: () => true,
    alert: (alert) => alerts.push(alert),
    save: (state) => (saved = state)
  })
  watcher.observe(usage(0.5, 0.1))
  assert.equal(alerts.length, 0)
  watcher.observe(usage(0.81, 0.1))
  watcher.observe(usage(0.85, 0.1))
  assert.deepEqual(
    alerts.map((a) => [a.window, a.step]),
    [['session', 0.8]]
  )
  // Pulou direto para 96%: só o de 95%.
  watcher.observe(usage(0.96, 0.1))
  assert.deepEqual(alerts.at(-1)?.step, 0.95)
  watcher.observe(usage(0.99, 0.1))
  assert.equal(alerts.length, 2)
  // A janela de 5 horas reiniciou (outra hora): vale de novo.
  watcher.observe(usage(0.82, 0.1, 2000))
  assert.equal(alerts.length, 3)
  assert.equal(alerts.at(-1)?.step, 0.8)
  // A semana tem os degraus dela.
  watcher.observe(usage(0.82, 0.97, 2000))
  assert.deepEqual([alerts.at(-1)?.window, alerts.at(-1)?.step], ['week', 0.95])
  assert.deepEqual(saved.week, { resetsAt: 9000, step: 0.95 })

  // Abrindo o Wisp de novo com o que ficou guardado: nada repete.
  const again: UsageAlert[] = []
  const reopened = new UsageAlerts({
    enabled: () => true,
    alert: (alert) => again.push(alert),
    load: () => saved
  })
  reopened.observe(usage(0.83, 0.97, 2000))
  assert.equal(again.length, 0)
})

test('o aviso do plano: nada desligado, nem com o limite já atingido', () => {
  const alerts: UsageAlert[] = []
  const off = new UsageAlerts({ enabled: () => false, alert: (alert) => alerts.push(alert) })
  off.observe(usage(0.9, null))
  const limited = new UsageAlerts({ enabled: () => true, alert: (alert) => alerts.push(alert) })
  limited.observe({ ...usage(1, null), limited: true })
  assert.equal(alerts.length, 0)
})

test('o texto do aviso: a porcentagem, quando reinicia e o que fazer', () => {
  const now = new Date(2026, 10, 3, 10, 0).getTime()
  const today = Math.floor(new Date(2026, 10, 3, 14, 30).getTime() / 1000)
  const a = describeUsage('session', { used: 0.83, resetsAt: today }, 0.8, now)
  assert.equal(a.title, '83% da janela de 5 horas do plano')
  assert.match(a.body, /reinicia às 14:30/)
  assert.match(a.body, /Sonnet/)
  const later = Math.floor(new Date(2026, 10, 5, 9, 0).getTime() / 1000)
  const b = describeUsage('week', { used: 0.96, resetsAt: later }, 0.95, now)
  assert.equal(b.title, '96% da semana do plano')
  assert.match(b.body, /reinicia quinta-feira, 09:00/)
  assert.match(b.body, /Perto do limite/)
})

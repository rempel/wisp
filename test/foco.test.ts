// O modo foco (Fase 45): o bloco liga o "quieto", acaba sozinho na hora (também depois de o
// computador suspender), parar não conta como acabar, e o menu oferece os blocos ou o parar.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MenuItemConstructorOptions } from 'electron'
import { focusActive, FocusMode, setFocusMode } from '../src/main/focus'
import { menuTemplate } from '../src/main/menu'
import type { TrayActions } from '../src/main/menu'

test('o bloco de foco: quieto até o fim, e o fim conta uma vez', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const done: number[] = []
  let changes = 0
  const mode = new FocusMode({ done: (minutes) => done.push(minutes), changed: () => changes++ })
  setFocusMode(mode)
  assert.equal(focusActive(), false)
  mode.start(25)
  assert.equal(focusActive(), true)
  assert.equal(mode.endsAt(), Date.now() + 25 * 60_000)
  t.mock.timers.tick(24 * 60_000)
  assert.equal(focusActive(), true)
  t.mock.timers.tick(60_000)
  assert.equal(focusActive(), false)
  assert.deepEqual(done, [25])
  assert.equal(changes, 2)
  // Parar no meio não é acabar.
  mode.start(50)
  t.mock.timers.tick(10 * 60_000)
  mode.stop()
  assert.equal(focusActive(), false)
  t.mock.timers.tick(60 * 60_000)
  assert.deepEqual(done, [25])
  setFocusMode(null)
  mode.dispose()
})

test('o bloco de foco: depois de suspender, acaba ao voltar', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const done: number[] = []
  const mode = new FocusMode({ done: (minutes) => done.push(minutes) })
  mode.start(25)
  // O relógio andou sem os temporizadores (o computador dormiu).
  t.mock.timers.setTime(Date.now() + 40 * 60_000)
  mode.resume()
  assert.deepEqual(done, [25])
  assert.equal(mode.active(), false)
})

test('o menu do foco: os blocos para começar, ou até quando vai e o parar', () => {
  let ends: number | null = null
  const started: number[] = []
  let stopped = 0
  const actions = {
    mascotVisible: () => true,
    setMascotVisible: () => {},
    newConversation: () => {},
    avatar: () => 'fogo',
    setAvatar: () => {},
    compactEnabled: () => false,
    setCompactEnabled: () => {},
    soundEnabled: () => true,
    setSoundEnabled: () => {},
    autostartEnabled: () => false,
    setAutostartEnabled: () => {},
    demoEnabled: () => false,
    setDemoEnabled: () => {},
    openSettings: () => {},
    openDiagnostics: () => {},
    openPalette: () => {},
    quiet: () => false,
    focusEndsAt: () => ends,
    startFocus: (minutes: number) => started.push(minutes),
    stopFocus: () => stopped++,
    shortcutLabel: () => null,
    voiceShortcutLabel: () => null,
    openConfig: () => {},
    quit: () => {}
  } as TrayActions
  const item = (): MenuItemConstructorOptions | undefined =>
    menuTemplate(actions, () => {}).find((entry) => /foco/i.test(String(entry.label)))
  const blocks = item()?.submenu as MenuItemConstructorOptions[]
  assert.equal(item()?.label, 'Modo foco')
  assert.deepEqual(
    blocks.map((entry) => entry.label),
    ['25 minutos, sem notificações nem sons', '50 minutos, sem notificações nem sons']
  )
  ;(blocks[1].click as () => void)()
  assert.deepEqual(started, [50])
  ends = new Date(2026, 10, 3, 14, 25).getTime()
  assert.equal(item()?.label, 'Parar o foco (até 14:25)')
  ;(item()?.click as () => void)()
  assert.equal(stopped, 1)
})

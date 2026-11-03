// Tudo a um atalho (Fase 32): a paleta de comandos acha sem acento e com todas as palavras, na
// ordem certa; o `wisp --palette`; o Ctrl+Shift+P no terminal. E o "não perturbe" do desktop,
// lido do KDE (Inhibited) e do GNOME (show-banners pelo portal), num D-Bus só do teste, com as
// mudanças por sinal (e só as do dono do nome); com ele ligado, nenhum som.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { after, test } from 'node:test'
import { CONFIG_PATH } from '../src/main/config'
import { DBusConnection, Variant } from '../src/main/dbus'
import { DoNotDisturb } from '../src/main/dnd'
import { checkCommand, parseCommand } from '../src/main/launcher'
import { Sounds } from '../src/main/sounds'
import { GROUP_ORDER, rankPalette, scoreItem } from '../src/renderer/chat/palette'
import type { PaletteGroup, PaletteItem } from '../src/renderer/chat/palette'
import { isWispTerminalShortcut } from '../src/renderer/chat/terminal-keys'
import { serveNotifications } from './fixtures/notifications'
import type { NotifyState } from './fixtures/notifications'
import { servePortalSettings } from './fixtures/portal-settings'

const item = (
  group: PaletteGroup,
  title: string,
  extra: Partial<PaletteItem> = {}
): PaletteItem => ({ id: `${group}-${title}`, group, title, run: () => {}, ...extra })

test('a paleta: sem busca, os grupos na ordem, poucas conversas e nenhum projeto', () => {
  const items = [
    ...Array.from({ length: 12 }, (_, i) => item('conversation', `Conversa ${i}`)),
    item('folder', 'Abrir loja numa conversa'),
    item('prompt', '/diff'),
    item('action', 'Nova conversa'),
    item('tab', 'Ir para a aba: Tubarões'),
    item('task', 'Rodar agora: Bom dia')
  ]
  const shown = rankPalette(items, '   ')
  assert.deepEqual(
    [...new Set(shown.map((entry) => entry.group))],
    ['tab', 'action', 'prompt', 'task', 'conversation']
  )
  assert.equal(shown.filter((entry) => entry.group === 'conversation').length, 8)
  assert.equal(shown.at(-1)?.title, 'Conversa 7')
  assert.deepEqual(GROUP_ORDER.slice(0, 2), ['tab', 'action'])
})

test('a paleta: sem acento, todas as palavras, e o que começa assim primeiro', () => {
  const items = [
    item('conversation', 'Ajuda com a migração do banco'),
    item('action', 'Modo: Planejar', { detail: 'só lê e monta um plano' }),
    item('action', 'Modo: Pedir', { keywords: 'permissão' }),
    item('conversation', 'Plano de férias'),
    item('action', 'Abrir uma pasta numa conversa…', { keywords: 'projeto diretório' }),
    item('prompt', '/planejar-sprint')
  ]
  const titles = (query: string): string[] => rankPalette(items, query).map((e) => e.title)
  assert.deepEqual(titles('MIGRACAO'), ['Ajuda com a migração do banco'])
  assert.deepEqual(titles('modo plan'), ['Modo: Planejar'])
  // Pelas palavras escondidas também.
  assert.deepEqual(titles('diretorio'), ['Abrir uma pasta numa conversa…'])
  assert.deepEqual(titles('permissao'), ['Modo: Pedir'])
  // "plan": começar o título vale mais que começar uma palavra, e isso mais que estar no meio.
  assert.deepEqual(titles('plan'), ['Plano de férias', 'Modo: Planejar', '/planejar-sprint'])
  assert.deepEqual(titles('xyz'), [])
  assert.equal(scoreItem(item('action', 'Nova conversa'), ['nova', 'xyz']), null)
  // No empate, a ordem dos grupos: a ação antes da conversa.
  const tie = rankPalette(
    [item('conversation', 'Configurações'), item('action', 'Configurações')],
    'config'
  )
  assert.deepEqual(
    tie.map((entry) => entry.group),
    ['action', 'conversation']
  )
})

test('wisp --palette e o Ctrl+Shift+P no terminal', () => {
  assert.deepEqual(parseCommand(['--no-sandbox', '--palette']), { kind: 'palette' })
  assert.deepEqual(checkCommand({ kind: 'palette' }), { kind: 'palette' })
  const press = (key: string, extra: Partial<Record<'shift' | 'alt', boolean>> = {}) => ({
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    altKey: extra.alt ?? false,
    shiftKey: extra.shift ?? false,
    metaKey: false
  })
  // O Ctrl+P é do Claude Code no terminal (o histórico); o Ctrl+Shift+P, da paleta.
  assert.equal(isWispTerminalShortcut(press('p')), false)
  assert.equal(isWispTerminalShortcut(press('P', { shift: true })), true)
})

test('com o "não perturbe", nenhum som', () => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({ sound: true, volume: 0.5 }))
  let quiet = true
  const played: string[] = []
  const sounds = new Sounds({
    play: (name) => played.push(name),
    custom: () => {},
    changed: () => {},
    muted: () => quiet
  })
  sounds.play('abrir')
  assert.deepEqual(played, [])
  quiet = false
  sounds.play('abrir')
  assert.deepEqual(played, ['abrir'])
})

// Um D-Bus só deste teste.
let daemon: { address: string; pid: number } | null = null
try {
  const [address, pid] = execFileSync(
    'dbus-daemon',
    ['--session', '--fork', '--print-address=1', '--print-pid=1'],
    { env: { ...process.env, HOME } }
  )
    .toString()
    .trim()
    .split('\n')
  daemon = { address, pid: Number(pid) }
} catch {
  // Sem o dbus-daemon, os testes daqui ficam de fora.
}
const skip = daemon ? false : 'sem o dbus-daemon'
const connections: DBusConnection[] = []
after(() => {
  for (const bus of connections) bus.close()
  if (daemon) process.kill(daemon.pid)
})
const connect = async (): Promise<DBusConnection> => {
  const bus = await DBusConnection.session({
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: daemon!.address
  })
  assert.ok(bus)
  connections.push(bus)
  return bus
}
const wait = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20))
}

test('não perturbe: sem nada no desktop que diga, nunca', { skip }, async () => {
  const dnd = new DoNotDisturb()
  assert.equal(await dnd.start(await connect()), null)
  assert.equal(dnd.active(), false)
  assert.deepEqual(dnd.state(), { active: null, source: null })
})

test('não perturbe: o do Windows chega pelo script da música (Fase 40)', () => {
  const dnd = new DoNotDisturb()
  const changes: boolean[] = []
  dnd.onChange((active) => changes.push(active))
  // A primeira leitura, desligado, não é uma mudança.
  dnd.report(false, 'windows')
  assert.deepEqual(dnd.state(), { active: false, source: 'windows' })
  dnd.report(true, 'windows')
  dnd.report(true, 'windows')
  assert.equal(dnd.active(), true)
  dnd.report(false, 'windows')
  assert.deepEqual(changes, [true, false])
})

test('não perturbe: o do KDE, e as mudanças pelo sinal do dono do nome', { skip }, async () => {
  const server = await connect()
  assert.ok(await server.requestName('org.freedesktop.Notifications'))
  const state: NotifyState = { actions: true, shown: [], closed: [], inhibited: true }
  const fake = serveNotifications(server, state)
  const dnd = new DoNotDisturb()
  const changes: boolean[] = []
  dnd.onChange((active) => changes.push(active))
  assert.equal(await dnd.start(await connect()), 'kde')
  assert.equal(dnd.active(), true)
  // A primeira leitura ligada conta como uma mudança (o Wisp fica quieto desde já).
  assert.deepEqual(changes, [true])
  fake.inhibit(false)
  await wait(() => !dnd.active())
  assert.equal(dnd.active(), false)
  // Outro processo imita o sinal: não vale.
  const intruder = await connect()
  intruder.emitSignal(
    '/org/freedesktop/Notifications',
    'org.freedesktop.DBus.Properties',
    'PropertiesChanged',
    'sa{sv}as',
    ['org.freedesktop.Notifications', { Inhibited: new Variant('b', true) }, []]
  )
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(dnd.active(), false)
  fake.inhibit(true)
  await wait(() => dnd.active())
  assert.deepEqual(changes, [true, false, true])
  dnd.dispose()
  fake.inhibit(false)
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(dnd.active(), true)
  server.close()
})

test('não perturbe: o do GNOME, pelo portal (o novo e o velho)', { skip }, async () => {
  for (const old of [false, true]) {
    const portal = await connect()
    assert.ok(await portal.requestName('org.freedesktop.portal.Desktop'))
    const fake = servePortalSettings(portal, { banners: false, old })
    const dnd = new DoNotDisturb()
    assert.equal(await dnd.start(await connect()), 'gnome')
    assert.equal(dnd.active(), true)
    fake.setBanners(true)
    await wait(() => !dnd.active())
    assert.equal(dnd.active(), false)
    assert.deepEqual(dnd.state(), { active: false, source: 'gnome' })
    dnd.dispose()
    portal.close()
    await new Promise((r) => setTimeout(r, 50))
  }
})

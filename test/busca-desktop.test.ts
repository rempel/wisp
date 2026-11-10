// O Wisp na busca do desktop (Fase 72): só o que começa com "wisp" vira pergunta; o KRunner e o
// GNOME falam com o app pelo D-Bus (aqui, um barramento só do teste) e a pergunta chega à
// conversa.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { DBusConnection } from '../src/main/dbus'
import {
  EXTENSION_UUID,
  extensionFiles,
  parseShellWindows,
  SHELL_IFACE,
  SHELL_NAME,
  SHELL_PATH,
  shellActivate,
  shellWindows
} from '../src/main/gnome-shell'
import { MARKER } from '../src/main/launcher'
import { listWindows } from '../src/main/windows'
import {
  krunnerFile,
  questionOf,
  removeSearchFiles,
  RUNNER_NAME,
  RUNNER_PATH,
  SEARCH_NAME,
  SEARCH_PATH,
  startSearchProvider
} from '../src/main/search-provider'

test('só o que começa com "wisp" é uma pergunta', () => {
  assert.equal(questionOf('wisp que horas são?'), 'que horas são?')
  assert.equal(questionOf('  Wisp: resume o README'), 'resume o README')
  assert.equal(questionOf('firefox'), null)
  assert.equal(questionOf('wisp'), null)
  assert.equal(questionOf('wisp a'), null)
  assert.equal(questionOf('wispa bolo'), null)
  assert.equal(questionOf(`wisp ${'x'.repeat(5000)}`)?.length, 2000)
})

test('o arquivo do KRunner é do Wisp e aponta o serviço dele', () => {
  const file = krunnerFile('/home/eu')
  assert.match(file.path, /krunner[\\/]dbusplugins[\\/]wisp\.desktop$/)
  assert.ok(file.content.includes(MARKER))
  assert.ok(file.content.includes(`X-Plasma-DBusRunner-Service=${RUNNER_NAME}`))
  assert.ok(file.content.includes(`X-Plasma-DBusRunner-Path=${RUNNER_PATH}`))
})

let daemon: { address: string; pid: number } | null = null
try {
  const [address, pid] = execFileSync(
    'dbus-daemon',
    ['--session', '--fork', '--print-address=1', '--print-pid=1'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim()
    .split('\n')
  daemon = { address, pid: Number(pid) }
} catch {
  // Sem o dbus-daemon, o teste daqui fica de fora.
}
const skip = daemon ? false : 'sem o dbus-daemon'
const closers: (() => void)[] = []
after(() => {
  for (const close of closers) close()
  if (daemon) process.kill(daemon.pid)
})

test('pelo D-Bus: o KRunner e o GNOME acham e mandam a pergunta', { skip }, async () => {
  const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: daemon!.address }
  process.env.XDG_DATA_HOME = join(HOME, 'dados')
  const asked: string[] = []
  const provider = await startSearchProvider((question) => asked.push(question), env)
  assert.ok(provider)
  closers.push(() => provider!.dispose())
  assert.ok(existsSync(krunnerFile().path), 'o arquivo do KRunner foi gravado')
  assert.ok(readFileSync(krunnerFile().path, 'utf8').includes(RUNNER_NAME))

  const client = await DBusConnection.session(env)
  assert.ok(client)
  closers.push(() => client!.close())
  const runner = (member: string, signature: string, body: unknown[]): Promise<unknown[]> =>
    client!.call({
      destination: RUNNER_NAME,
      path: RUNNER_PATH,
      interface: 'org.kde.krunner1',
      member,
      signature,
      body
    })
  const [none] = await runner('Match', 's', ['firefox'])
  assert.deepEqual(none, [], 'uma busca comum não passa pelo Wisp')
  const [matches] = (await runner('Match', 's', ['wisp que horas são?'])) as [unknown[][]]
  assert.equal(matches.length, 1)
  assert.equal(matches[0][0], 'que horas são?')
  assert.match(String(matches[0][1]), /que horas são\?/)
  await runner('Run', 'ss', ['que horas são?', ''])
  assert.deepEqual(asked, ['que horas são?'])

  const search = (member: string, signature: string, body: unknown[]): Promise<unknown[]> =>
    client!.call({
      destination: SEARCH_NAME,
      path: SEARCH_PATH,
      interface: 'org.gnome.Shell.SearchProvider2',
      member,
      signature,
      body
    })
  assert.deepEqual(await search('GetInitialResultSet', 'as', [['firefox']]), [[]])
  const [ids] = (await search('GetInitialResultSet', 'as', [['wisp', 'resume', 'isto']])) as [
    string[]
  ]
  assert.deepEqual(ids, ['resume isto'])
  const [metas] = (await search('GetResultMetas', 'as', [ids])) as [Record<string, unknown>[]]
  assert.equal(metas.length, 1)
  await search('ActivateResult', 'sasu', ['resume isto', ['wisp', 'resume', 'isto'], 0])
  assert.deepEqual(asked, ['que horas são?', 'resume isto'])

  // Desligada: o arquivo do KRunner sai.
  removeSearchFiles()
  assert.equal(existsSync(krunnerFile().path), false)
  delete process.env.XDG_DATA_HOME
})

test('a extensão do GNOME: os arquivos são do Wisp e o código é um módulo válido (Fase 70)', () => {
  const [metadata, code] = extensionFiles('/home/eu')
  assert.match(
    metadata.path,
    /gnome-shell[\\/]extensions[\\/]wisp@rempel\.github\.io[\\/]metadata\.json$/
  )
  const parsed = JSON.parse(metadata.content) as Record<string, unknown>
  assert.equal(parsed.uuid, EXTENSION_UUID)
  assert.ok(metadata.content.includes(MARKER) && code.content.includes(MARKER))
  // O node confere a sintaxe do módulo (os imports do GNOME só se resolvem lá).
  const file = join(HOME, 'extension.mjs')
  writeFileSync(file, code.content)
  execFileSync(process.execPath, ['--check', file], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
})

test('o que a extensão manda é conferido', () => {
  assert.deepEqual(
    parseShellWindows(
      JSON.stringify([
        { id: 7, app: 'Firefox', title: 'Wisp', minimized: false, active: true, pid: 99 },
        { id: 'x', app: 'ruim' },
        { id: 8, app: 5, title: null }
      ])
    ),
    [
      { id: 7, app: 'Firefox', title: 'Wisp', minimized: false, active: true, pid: 99 },
      { id: 8, app: '', title: '', minimized: false, active: false }
    ]
  )
  assert.equal(parseShellWindows('não é json'), null)
  assert.equal(parseShellWindows('{}'), null)
})

test(
  'pelo D-Bus: as janelas e o trazer para a frente, com um GNOME de mentira',
  { skip },
  async () => {
    const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: daemon!.address }
    // Sem a extensão: null, e o Wisp segue como antes.
    assert.equal(await shellWindows(1, env), null)
    assert.equal(await shellActivate(7, env), false)
    const shell = await DBusConnection.session(env)
    assert.ok(shell)
    closers.push(() => shell!.close())
    assert.ok(await shell!.requestName(SHELL_NAME))
    const activated: number[] = []
    shell!.export(SHELL_PATH, SHELL_IFACE, {
      methods: {
        ListWindows: {
          in: '',
          out: 's',
          handler: () => [
            JSON.stringify([
              {
                id: 7,
                app: 'Firefox',
                title: 'Notícias',
                minimized: false,
                active: true,
                pid: 500
              },
              { id: 9, app: 'Wisp', title: 'Wisp', minimized: false, active: false, pid: 42 }
            ])
          ]
        },
        ActivateWindow: {
          in: 'u',
          out: 'b',
          handler: ([id]) => {
            activated.push(id as number)
            return [id === 7]
          }
        }
      }
    })
    const windows = await shellWindows(42, env)
    assert.deepEqual(
      windows?.map((window) => window.app),
      ['Firefox'],
      'sem as do próprio Wisp'
    )
    assert.equal(await shellActivate(7, env), true)
    assert.equal(await shellActivate(123, env), false)
    assert.deepEqual(activated, [7, 123])
    // E pelo caminho de sempre: no GNOME com Wayland, a lista vem da extensão.
    const listed = await listWindows({
      ...env,
      XDG_SESSION_TYPE: 'wayland',
      XDG_CURRENT_DESKTOP: 'GNOME'
    })
    assert.ok(Array.isArray(listed))
    assert.ok((listed as { id: string }[]).some((window) => window.id === 'gnome:7'))
  }
)

// O Wisp num Flatpak (Fase 25): os programas do sistema pelo flatpak-spawn --host, com as
// variáveis certas (e nunca a chave da API); o comando `wisp` e o relay dos hooks pelo
// flatpak run; o início com o sistema no ~/.config de verdade; e as pastas que dentro e fora do
// sandbox enxergam igual.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { autostartPath } from '../src/main/autostart'
import { WRAPPER_PATH, deployRelay } from '../src/main/hooks/install'
import { socketDir } from '../src/main/hooks/protocol'
import { hostPath, viaHost } from '../src/main/host'
import { deployLauncher, installKind, LAUNCHER_PATH } from '../src/main/launcher'

test('fora do Flatpak, o programa roda como sempre', () => {
  assert.deepEqual(viaHost('/usr/bin/gh', ['api'], { inFlatpak: false }), {
    command: '/usr/bin/gh',
    args: ['api']
  })
})

test('no Flatpak: flatpak-spawn --host, a pasta, as variáveis que mudaram e sem a chave', () => {
  const base = {
    PATH: '/app/bin:/usr/bin',
    HOME: '/home/u',
    XDG_CONFIG_HOME: '/home/u/.var/app/io.github.rempel.Wisp/config',
    npm_config_x: '1',
    LANG: 'pt_BR.UTF-8'
  }
  const env: NodeJS.ProcessEnv = {
    PATH: '/home/u/.local/bin:/app/bin:/usr/bin',
    HOME: '/home/u',
    XDG_CONFIG_HOME: base.XDG_CONFIG_HOME,
    LANG: 'pt_BR.UTF-8',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    WISP_INTERNAL: '1'
  }
  const run = viaHost('/run/host/usr/bin/claude', ['-p', '--verbose'], {
    env,
    base,
    cwd: '/home/u/projeto',
    unset: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    inFlatpak: true
  })
  assert.equal(run.command, 'flatpak-spawn')
  assert.deepEqual(run.args, [
    '--host',
    '--watch-bus',
    '--directory=/home/u/projeto',
    'env',
    '-u',
    'ANTHROPIC_API_KEY',
    '-u',
    'ANTHROPIC_AUTH_TOKEN',
    '-u',
    'npm_config_x',
    'CLAUDE_CODE_DISABLE_AUTO_MEMORY=1',
    'WISP_INTERNAL=1',
    // O PATH e as pastas XDG de dentro não vão: o sistema tem os dele.
    '/usr/bin/claude',
    '-p',
    '--verbose'
  ])
  assert.equal(hostPath('/run/host/usr/bin/whisper-cli'), '/usr/bin/whisper-cli')
  assert.equal(hostPath('/home/u/.local/bin/claude'), '/home/u/.local/bin/claude')
})

test('no Flatpak: o tipo de instalação, o comando wisp e o relay pelo flatpak run', () => {
  assert.equal(installKind(true, { FLATPAK_ID: 'io.github.rempel.Wisp' }), 'flatpak')
  assert.equal(installKind(true, {}), 'package')
  deployLauncher(
    { electron: '/app/wisp/wisp', appPath: null, icon: '/i.png', flatpak: 'io.github.rempel.Wisp' },
    false
  )
  const script = readFileSync(LAUNCHER_PATH, 'utf8')
  assert.match(script, /^exec flatpak run 'io\.github\.rempel\.Wisp' "\$@"$/m)
  assert.doesNotMatch(script, /\/app\/wisp\/wisp/)
  deployRelay(
    '/app/wisp/wisp',
    '/app/wisp/resources/app/out/main/wisp-hook.js',
    'io.github.rempel.Wisp'
  )
  const relay = readFileSync(WRAPPER_PATH, 'utf8')
  assert.match(
    relay,
    /^exec flatpak run --command='\/app\/wisp\/wisp' --env=ELECTRON_RUN_AS_NODE=1 'io\.github\.rempel\.Wisp' '\/app\/wisp\/resources\/app\/out\/main\/wisp-hook\.js' "\$@"$/m
  )
  // De volta ao normal, para os outros testes.
  deployRelay('/opt/Wisp/wisp', '/opt/Wisp/resources/app/out/main/wisp-hook.js', null)
  assert.match(readFileSync(WRAPPER_PATH, 'utf8'), /ELECTRON_RUN_AS_NODE=1 exec "\$electron"/)
})

test('no Flatpak: o autostart do sistema e o socket na pasta do app', () => {
  const sandbox = {
    FLATPAK_ID: 'io.github.rempel.Wisp',
    XDG_CONFIG_HOME: join(HOME, '.var/app/io.github.rempel.Wisp/config'),
    XDG_RUNTIME_DIR: '/run/user/1000'
  }
  assert.equal(
    autostartPath(sandbox),
    join(HOME, '.config/autostart/io.github.rempel.Wisp.desktop')
  )
  assert.equal(socketDir(sandbox), '/run/user/1000/app/io.github.rempel.Wisp/wisp')
  assert.equal(socketDir({ XDG_RUNTIME_DIR: '/run/user/1000' }), '/run/user/1000/wisp')
})

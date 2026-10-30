// O essencial no Windows (Fase 33), no que dá para conferir em qualquer sistema: achar o claude
// (o .exe antes do .cmd, nunca o script do sh sem extensão), rodar o atalho .cmd do npm pelo
// node.exe com o cli.js (sem shell), um script do Node pelo node, o nome do PATH, e a resposta
// do hook do Bash que o Wisp dá quando o Claude Code o roda na forma exec.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ASK_FOR_BASH, MODE_FILE_ENV, modeHookOutput } from '../src/main/mode-hook'
import { npmShimTarget, pathDirs, pathKey, resolveWindows, windowsLaunch } from '../src/main/win'

const NPM_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*'
].join('\r\n')

function folder(name: string, files: Record<string, string>): string {
  const dir = join(HOME, name)
  mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  return dir
}

test('o PATH, que no Windows se chama Path', () => {
  assert.equal(pathKey({ Path: 'a' }), 'Path')
  assert.equal(pathKey({ PATH: 'a' }), 'PATH')
  assert.equal(pathKey({}), 'PATH')
  const sep = process.platform === 'win32' ? ';' : ':'
  assert.deepEqual(pathDirs({ Path: ['a', '', 'b'].join(sep) }), ['a', 'b'])
})

test('achar o claude: o .exe antes do .cmd, e nunca o script do sh sem extensão', () => {
  const both = folder('ambos', { 'claude.exe': '', 'claude.cmd': NPM_SHIM, claude: '#!/bin/sh' })
  const npm = folder('npm', { 'claude.cmd': NPM_SHIM, claude: '#!/bin/sh' })
  const sh = folder('sh', { claude: '#!/bin/sh' })
  assert.equal(resolveWindows('claude', [sh, both]), join(both, 'claude.exe'))
  assert.equal(resolveWindows('claude', [sh, npm]), join(npm, 'claude.cmd'))
  assert.equal(resolveWindows('claude', [sh]), null)
  // Um caminho: com a extensão, ou o arquivo como está (o claudePath do config.json).
  assert.equal(resolveWindows(join(npm, 'claude'), []), join(npm, 'claude.cmd'))
  assert.equal(resolveWindows(join(sh, 'claude'), []), join(sh, 'claude'))
  assert.equal(resolveWindows(join(both, 'claude.exe'), []), join(both, 'claude.exe'))
})

test('o atalho .cmd do npm roda o cli.js pelo node.exe, sem shell', () => {
  assert.equal(
    npmShimTarget(join('C', 'npm', 'claude.cmd'), NPM_SHIM),
    join('C', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  )
  assert.equal(
    npmShimTarget(join('C', 'pnpm', 'claude.cmd'), '"%~dp0\\..\\claude-code\\cli.mjs" %*'),
    join('C', 'pnpm', '..', 'claude-code', 'cli.mjs')
  )
  assert.equal(npmShimTarget('x.cmd', '@echo off\r\nnotepad.exe %*'), null)

  const cli = join('node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  // Com o node.exe ao lado do atalho (o npm do instalador do Node).
  const beside = folder('npm-node', { 'claude.cmd': NPM_SHIM, 'node.exe': '', [cli]: '' })
  assert.deepEqual(windowsLaunch(join(beside, 'claude.cmd'), ['-p', 'oi'], { PATH: '' }), {
    command: join(beside, 'node.exe'),
    args: [join(beside, cli), '-p', 'oi']
  })
  // Com o node.exe no PATH.
  const shim = folder('npm-path', { 'claude.cmd': NPM_SHIM, [cli]: '' })
  const nodeDir = folder('nodejs', { 'node.exe': '' })
  assert.deepEqual(windowsLaunch(join(shim, 'claude.cmd'), ['-p'], { Path: nodeDir }), {
    command: join(nodeDir, 'node.exe'),
    args: [join(shim, cli), '-p']
  })
  // Sem Node nenhum: o Electron do próprio Wisp, como Node.
  const alone = windowsLaunch(join(shim, 'claude.cmd'), ['-p'], { PATH: '' })
  assert.equal(alone.command, process.execPath)
  assert.deepEqual(alone.env, { ELECTRON_RUN_AS_NODE: '1' })
  // Um atalho que aponta para um cli.js que não existe vai como está (e o erro aparece).
  const broken = folder('npm-quebrado', { 'claude.cmd': NPM_SHIM })
  assert.deepEqual(windowsLaunch(join(broken, 'claude.cmd'), ['-p'], { PATH: nodeDir }), {
    command: join(broken, 'claude.cmd'),
    args: ['-p']
  })
})

test('o .exe roda direto, e um script do Node pelo node', () => {
  assert.deepEqual(windowsLaunch('C:\\bin\\claude.exe', ['-p'], {}), {
    command: 'C:\\bin\\claude.exe',
    args: ['-p']
  })
  const nodeDir = folder('node-script', { 'node.exe': '' })
  const scripts = folder('scripts', {
    'fake-claude': '#!/usr/bin/env node\nconsole.log(1)\n',
    'sh-claude': '#!/bin/sh\necho 1\n'
  })
  assert.deepEqual(windowsLaunch(join(scripts, 'fake-claude'), ['--version'], { PATH: nodeDir }), {
    command: join(nodeDir, 'node.exe'),
    args: [join(scripts, 'fake-claude'), '--version']
  })
  assert.deepEqual(windowsLaunch(join(scripts, 'sh-claude'), ['-p'], { PATH: nodeDir }), {
    command: join(scripts, 'sh-claude'),
    args: ['-p']
  })
})

test('o hook do Bash: pede em todo modo, menos no Automático', () => {
  const dir = folder('modos', { pedir: 'default\n', auto: 'auto\n', plano: 'plan' })
  const run = (file?: string): string =>
    modeHookOutput(file ? { [MODE_FILE_ENV]: join(dir, file) } : {})
  assert.equal(run('pedir'), ASK_FOR_BASH)
  assert.equal(run('plano'), ASK_FOR_BASH)
  assert.equal(run('auto'), '')
  // Sem o arquivo (ou sem a variável), pede: na dúvida, o card.
  assert.equal(run('sumiu'), ASK_FOR_BASH)
  assert.equal(run(), ASK_FOR_BASH)
  assert.match(ASK_FOR_BASH, /"permissionDecision":"ask"/)
})

test('o chaveiro do Windows: cifrado, num arquivo por segredo, e trocado inteiro', async () => {
  const { deleteWindowsSecret, hasWindowsSecret, readWindowsSecret, storeWindowsSecret } =
    await import('../src/main/secrets-win')
  const dir = join(HOME, 'segredos')
  // Um DPAPI de mentira: inverte os bytes (o de verdade só existe no Windows, pelo Electron).
  const cipher = {
    available: () => true,
    encrypt: (text: string) => Buffer.from(text, 'utf8').reverse(),
    decrypt: (data: Buffer) => Buffer.from(data).reverse().toString('utf8')
  }
  assert.equal(hasWindowsSecret('openrouter', dir), false)
  assert.equal(readWindowsSecret('openrouter', dir, cipher), null)
  storeWindowsSecret('openrouter', 'sk-or-123', dir, cipher)
  assert.equal(hasWindowsSecret('openrouter', dir), true)
  assert.equal(readWindowsSecret('openrouter', dir, cipher), 'sk-or-123')
  // No disco, nem o valor nem o nome do segredo aparecem.
  const files = readdirSync(dir)
  assert.equal(files.length, 1)
  assert.doesNotMatch(files[0], /openrouter/)
  assert.doesNotMatch(readFileSync(join(dir, files[0]), 'utf8'), /sk-or-123/)
  storeWindowsSecret('openrouter', 'sk-or-456', dir, cipher)
  assert.equal(readWindowsSecret('openrouter', dir, cipher), 'sk-or-456')
  assert.equal(readdirSync(dir).length, 1)
  // Sem o DPAPI, o erro diz; e o que não decifra (outra conta) também.
  assert.throws(
    () => storeWindowsSecret('celular', 'x', dir, { ...cipher, available: () => false }),
    /DPAPI/
  )
  const broken = {
    ...cipher,
    decrypt: () => {
      throw new Error('chave errada')
    }
  }
  assert.throws(() => readWindowsSecret('openrouter', dir, broken), /não decifrou/)
  deleteWindowsSecret('openrouter', dir)
  deleteWindowsSecret('openrouter', dir)
  assert.equal(hasWindowsSecret('openrouter', dir), false)
})

test('a notificação do Windows: o XML com os botões, e o clique volta pelo endereço', async () => {
  const { parseToastUrl, toastUrl, toastXml, windowsNotifier } = await import('../src/main/toast')
  const allow = 'allow-0123456789abcdef'
  const deny = 'deny-fedcba9876543210'
  const card = {
    summary: 'O Claude quer rodar um comando',
    body: 'rm -rf build &amp;&amp; echo "<ok>"\nApaga arquivos',
    actions: ['default', 'Abrir o painel', allow, 'Permitir', deny, 'Negar']
  }
  const xml = toastXml(card, 7)
  assert.match(xml, /launch="wisp:\/\/notificacao\/7\/default"/)
  assert.match(xml, /scenario="reminder"/)
  assert.match(
    xml,
    /<action content="Permitir" activationType="protocol" arguments="wisp:\/\/notificacao\/7\/allow-0123456789abcdef"\/>/
  )
  // O corpo vem com a marcação do D-Bus; no XML, cada caractere escapado uma vez só.
  assert.match(xml, /<text>rm -rf build &amp;&amp; echo &quot;&lt;ok&gt;&quot;<\/text>/)
  assert.doesNotMatch(xml, /&amp;amp;/)
  // Sem botões, ela some sozinha (sem o cenário de lembrete).
  assert.doesNotMatch(toastXml({ summary: 'Oi', body: 'tudo certo', actions: [] }, 1), /reminder/)

  assert.deepEqual(parseToastUrl(toastUrl(7, allow)), { id: 7, key: allow })
  assert.deepEqual(parseToastUrl('wisp://notificacao/7/default/'), { id: 7, key: 'default' })
  for (const bad of [
    'wisp://notificacao/7/allow-123',
    'wisp://notificacao/x/default',
    'wisp://outra/7/default',
    'https://notificacao/7/default',
    '--show'
  ]) {
    assert.equal(parseToastUrl(bad), null, bad)
  }

  const actions: [number, string][] = []
  const closed: number[] = []
  const toasts: { xml: string; closed: boolean; onClosed: () => void }[] = []
  const notifier = windowsNotifier(
    (id, key) => actions.push([id, key]),
    (id) => closed.push(id),
    (xml, onClosed) => {
      const toast = { xml, closed: false, onClosed }
      toasts.push(toast)
      return { close: () => (toast.closed = true) }
    },
    () => true
  )
  assert.equal(await notifier.hasActions(), true)
  // Sem o endereço registrado (rodando do código), sem botões.
  assert.equal(
    await windowsNotifier(
      () => {},
      () => {},
      () => ({ close: () => {} }),
      () => false
    ).hasActions(),
    false
  )
  const id = await notifier.show(card)
  assert.match(toasts[0].xml, new RegExp(`notificacao/${id}/${allow}`))
  assert.equal(notifier.action(toastUrl(id, allow)), true)
  assert.deepEqual(actions, [[id, allow]])
  // Um endereço de uma notificação que não está na tela não faz nada.
  assert.equal(notifier.action(toastUrl(id + 1, allow)), false)
  notifier.close(id)
  assert.equal(toasts[0].closed, true)
  assert.equal(notifier.action(toastUrl(id, allow)), false)
  // Fechada pelo Windows (dispensada), o card continua no painel.
  const other = await notifier.show(card)
  toasts[1].onClosed()
  assert.deepEqual(closed, [other])
})

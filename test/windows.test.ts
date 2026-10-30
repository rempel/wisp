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

test('os hooks da aba Sessões: no Windows, o próprio Wisp na forma exec, e tirar acha os dele', async () => {
  const { applyHooks, hooksStatus, previewHooks, settingsPath } =
    await import('../src/main/hooks/install')
  const { setSelfCommand } = await import('../src/main/self-command')
  setSelfCommand(join(HOME, 'Wisp', 'wisp.exe'), [])
  const install = previewHooks('install')
  assert.ok(!('error' in install))
  const applied = applyHooks('install', install.fingerprint)
  assert.ok(!('error' in applied))
  const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'))
  const hook = settings.hooks.PermissionRequest[0].hooks[0]
  if (process.platform === 'win32') {
    assert.equal(hook.command, join(HOME, 'Wisp', 'wisp.exe'))
    assert.deepEqual(hook.args, ['--wisp-hook', 'PermissionRequest'])
  } else {
    assert.match(hook.command, /\/wisp-hook' PermissionRequest$/)
    assert.equal(hook.args, undefined)
  }
  assert.equal(hooksStatus().installed, true)
  // Tirar acha as entradas do Wisp (pelo --wisp-hook no Windows) e deixa o resto.
  const remove = previewHooks('uninstall')
  assert.ok(!('error' in remove))
  assert.ok(!('error' in applyHooks('uninstall', remove.fingerprint)))
  const after = JSON.parse(readFileSync(settingsPath(), 'utf8'))
  assert.equal(after.hooks, undefined)
  assert.equal(hooksStatus().installed, false)
})

// As integrações do Windows (Fase 35, parte 3): o terminal, os apps, as janelas, a música e o
// volume. O que é lógica pura roda em qualquer sistema; os scripts do PowerShell, só no Windows.

test('achar programas no Windows: pelo PATHEXT, só pastas absolutas, nunca a pasta atual', async () => {
  const { launchableWindows, whichWindows } = await import('../src/main/desktop-win')
  const bin = folder('win-bin', { 'wt.exe': '', 'code.cmd': '', 'velho.com': '' })
  mkdirSync(join(bin, 'pasta.exe'), { recursive: true })
  const env = {
    PATH: ['relativa', bin].join(process.platform === 'win32' ? ';' : ':'),
    PATHEXT: '.COM;.EXE;.CMD'
  }
  assert.equal(whichWindows('wt', env), join(bin, 'wt.exe'))
  assert.equal(whichWindows('wt.exe', env), join(bin, 'wt.exe'))
  assert.equal(whichWindows('code', env), join(bin, 'code.cmd'))
  assert.equal(whichWindows('velho', env), join(bin, 'velho.com'))
  // Uma pasta com nome de programa não é programa; um caminho relativo não vale.
  assert.equal(whichWindows('pasta', env), null)
  assert.equal(whichWindows(join('relativa', 'wt.exe'), env), null)
  assert.equal(whichWindows(join(bin, 'wt'), env), join(bin, 'wt.exe'))
  assert.equal(whichWindows('nada', env), null)

  // O .cmd de um editor conhecido vira o executável dele; outro script, nada.
  const vscode = join(HOME, 'Programs', 'Microsoft VS Code')
  const exists = (path: string): boolean => path === join(vscode, 'Code.exe')
  assert.equal(launchableWindows(join(vscode, 'bin', 'code.cmd'), exists), join(vscode, 'Code.exe'))
  assert.equal(launchableWindows(join(vscode, 'bin', 'outro.cmd'), exists), null)
  assert.equal(
    launchableWindows(join(vscode, 'bin', 'code.bat'), () => false),
    null
  )
  assert.equal(launchableWindows(join(bin, 'wt.exe')), join(bin, 'wt.exe'))
  assert.equal(launchableWindows(join(bin, 'script.ps1')), null)
})

test('os apps do Windows: os atalhos do menu Iniciar, o do usuário primeiro, sem desinstalar', async () => {
  const { readWindowsApps, startMenuDirs, windowsTerminals } =
    await import('../src/main/desktop-win')
  const user = folder('menu-usuario', {
    'Firefox.lnk': '',
    'Steam/Jogo legal.url': '',
    'Ferramentas/Fundo/Mais fundo/Longe/Escondido.lnk': '',
    'desktop.ini': ''
  })
  const all = folder('menu-todos', {
    'firefox.lnk': '',
    'Visual Studio Code/Visual Studio Code.lnk': '',
    'Visual Studio Code/Uninstall Visual Studio Code.lnk': '',
    'Acessórios/Bloco de Notas.lnk': ''
  })
  const apps = readWindowsApps([user, all])
  assert.deepEqual(
    apps.map((app) => [app.id, app.nome]),
    [
      ['Acessórios/Bloco de Notas', 'Bloco de Notas'],
      ['Firefox', 'Firefox'],
      ['Steam/Jogo legal', 'Jogo legal'],
      ['Visual Studio Code/Visual Studio Code', 'Visual Studio Code']
    ]
  )
  assert.equal(apps.find((app) => app.nome === 'Firefox')?.path, join(user, 'Firefox.lnk'))
  assert.deepEqual(
    startMenuDirs({ APPDATA: 'A', ProgramData: 'P' }).map((dir) => dir.split(/[\\/]/)[0]),
    ['A', 'P']
  )
  // O Windows Terminal primeiro, o cmd por último.
  assert.deepEqual(
    windowsTerminals().map(([command]) => command),
    ['wt.exe', 'pwsh.exe', 'powershell.exe', 'cmd.exe']
  )
})

test('a música no Windows: as sessões do controle de mídia viram players, e a escolha é a mesma', async () => {
  const { appNameOf, playerOf } = await import('../src/main/media-win')
  const { choosePlayers } = await import('../src/main/media')
  assert.equal(appNameOf('Spotify.exe'), 'Spotify')
  assert.equal(appNameOf('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'ZuneMusic')
  assert.equal(appNameOf('chrome'), 'Chrome')
  const spotify = playerOf({
    id: 'Spotify.exe',
    name: null,
    status: 'Playing',
    title: 'Song',
    artist: 'Artist',
    album: '',
    canControl: true
  })
  assert.deepEqual(spotify, {
    bus: 'Spotify.exe',
    name: 'Spotify',
    status: 'Playing',
    title: 'Song',
    artist: 'Artist',
    canControl: true
  })
  const firefox = playerOf({
    id: '308046B0AF4A39CB',
    name: 'Firefox',
    status: 'Changing',
    title: null,
    artist: null,
    album: null,
    canControl: true
  })
  assert.equal(firefox.name, 'Firefox')
  assert.equal(firefox.status, 'Stopped')
  const none = 'Nenhum player de música ou vídeo aberto.'
  assert.equal(choosePlayers([], 'tocar', undefined, null, none), none)
  assert.deepEqual(choosePlayers([firefox, spotify], 'pausar', undefined, null), [spotify])
  assert.deepEqual(choosePlayers([firefox, spotify], 'proxima', 'fire', null), [firefox])
  assert.equal(
    choosePlayers([{ ...spotify, status: 'Paused' }], 'pausar', undefined, null),
    'Nada está tocando.'
  )
})

const windowsOnly = { skip: process.platform !== 'win32' && 'só no Windows' }

test(
  'as janelas do Windows: lista a do Bloco de Notas e a traz para a frente',
  windowsOnly,
  async () => {
    const { spawn } = await import('node:child_process')
    const { activateWindowsWindow, windowsWindows } = await import('../src/main/windows-win')
    const file = join(
      folder('janelas', { 'wisp-janela-de-teste.txt': 'oi' }),
      'wisp-janela-de-teste.txt'
    )
    const notepad = spawn('notepad.exe', [file], { stdio: 'ignore' })
    try {
      let found
      for (let i = 0; i < 40 && !found; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        found = (await windowsWindows())?.find((window) =>
          window.title.includes('wisp-janela-de-teste')
        )
      }
      assert.ok(found, 'a janela do Bloco de Notas aparece')
      assert.ok(found.pid > 0)
      assert.match(found.app ?? '', /notepad|bloco|notas/i)
      console.log(`janela: ${JSON.stringify(found)}`)
      // Trazer para a frente pode ser barrado pelo Windows (o teste não é a janela da frente):
      // o que importa é o script rodar e responder.
      console.log(`trazer para a frente: ${await activateWindowsWindow(found.id)}`)
      assert.equal(await activateWindowsWindow(1), false)
    } finally {
      notepad.kill()
    }
  }
)

test(
  'o volume e a música do Windows: os scripts rodam (sem aparelho de som, o erro do Windows)',
  windowsOnly,
  async () => {
    const { setWindowsVolume } = await import('../src/main/volume-win')
    const { WindowsMedia } = await import('../src/main/media-win')
    const started = Date.now()
    const level = await setWindowsVolume({ step: 0 })
    console.log(`volume: ${JSON.stringify(level)} (${Date.now() - started} ms)`)
    if (typeof level === 'number') {
      assert.ok(level >= 0 && level <= 100)
      assert.equal(await setWindowsVolume({ level }), level)
    } else {
      // Sem aparelho de som (o CI), o erro é o do Windows, não um do script (C# ou PowerShell).
      assert.doesNotMatch(
        level.error,
        /error CS\d|ParserError|Add-Type|não é reconhecido|not recognized/i
      )
    }
    const media = new WindowsMedia()
    const players = await media.players()
    console.log(`players: ${JSON.stringify(players)}`)
    assert.ok(Array.isArray(players))
  }
)

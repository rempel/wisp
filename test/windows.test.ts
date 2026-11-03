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
  const { mergeApps, readWindowsApps, startMenuDirs, windowsTerminals } =
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
  // A lista do Windows soma os apps sem atalho (os da loja), abertos pelo shell:AppsFolder; um
  // nome que já tem atalho fica com o atalho.
  const merged = mergeApps(apps, [
    { nome: 'Calculadora', id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
    { nome: 'firefox', id: '308046B0AF4A39CB' },
    { nome: 'Desinstalar o Programa', id: 'x' },
    { nome: '', id: 'y' }
  ])
  assert.deepEqual(
    merged.map((app) => app.nome),
    ['Bloco de Notas', 'Calculadora', 'Firefox', 'Jogo legal', 'Visual Studio Code']
  )
  assert.equal(
    merged.find((app) => app.nome === 'Calculadora')?.path,
    'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
  )
  assert.equal(merged.find((app) => app.nome === 'Firefox')?.path, join(user, 'Firefox.lnk'))
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
  'as janelas do Windows: lista uma janela aberta e a traz para a frente',
  windowsOnly,
  async () => {
    const { spawn, spawnSync } = await import('node:child_process')
    const { activateWindowsWindow, windowsWindows } = await import('../src/main/windows-win')
    // Uma janela com título conhecido: um formulário do próprio PowerShell.
    const form = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; ' +
          "$f.Text = 'wisp-janela-de-teste'; [System.Windows.Forms.Application]::Run($f)"
      ],
      { stdio: 'ignore' }
    )
    try {
      let windows: Awaited<ReturnType<typeof windowsWindows>> = null
      let found
      for (let i = 0; i < 40 && !found; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        windows = await windowsWindows()
        found = windows?.find((window) => window.title.includes('wisp-janela-de-teste'))
      }
      if (!found) {
        console.log(`janelas: ${JSON.stringify(windows)}`)
        const processes = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ' +
              'Format-Table Id, ProcessName, MainWindowHandle, MainWindowTitle -AutoSize | Out-String -Width 200'
          ],
          { encoding: 'utf8' }
        )
        console.log(processes.stdout, processes.stderr)
      }
      assert.ok(found, 'a janela aparece')
      assert.ok(found.pid > 0)
      assert.match(found.app ?? '', /powershell/i)
      console.log(`janela: ${JSON.stringify(found)}`)
      // Trazer para a frente pode ser barrado pelo Windows (o teste não é a janela da frente):
      // o que importa é o script rodar e responder.
      console.log(`trazer para a frente: ${await activateWindowsWindow(found.id)}`)
      assert.equal(await activateWindowsWindow(1), false)
    } finally {
      form.kill()
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

test(
  'a música acompanhada (Fase 37): o PowerShell escreve a lista, aceita os comandos e fecha',
  windowsOnly,
  async () => {
    const { WindowsMediaWatcher } = await import('../src/main/media-win-watch')
    const watcher = new WindowsMediaWatcher()
    const errors: string[] = []
    const warn = console.warn
    console.warn = (...args: unknown[]) => errors.push(args.join(' '))
    try {
      const first = new Promise<unknown>((resolve) => watcher.once('sessions', resolve))
      // O "não perturbe" vem na primeira volta do laço também (Fase 40).
      const quiet = new Promise<unknown>((resolve) => watcher.once('dnd', resolve))
      const started = Date.now()
      watcher.start()
      const sessions = await Promise.race([
        first,
        new Promise((resolve) => setTimeout(() => resolve('passou de 30 s'), 30_000))
      ])
      console.log(`a primeira lista em ${Date.now() - started} ms: ${JSON.stringify(sessions)}`)
      assert.ok(Array.isArray(sessions), `${String(sessions)}\n${errors.join('\n')}`)
      const dnd = await Promise.race([
        quiet,
        new Promise((resolve) => setTimeout(() => resolve('passou de 10 s'), 10_000))
      ])
      console.log(`o não perturbe: ${String(dnd)}`)
      assert.equal(typeof dnd, 'boolean', `${String(dnd)}\n${errors.join('\n')}`)
      // Um comando para um player que não existe, a pressa e o volume (sem aparelho de som no CI,
      // o erro do Windows): ele continua lendo.
      assert.ok(watcher.send({ id: 'nenhum.exe', acao: 'PlayPause' }))
      assert.ok(watcher.send({ acao: 'Rapido', valor: true }))
      assert.ok(watcher.send({ acao: 'Volume', valor: -1 }))
      await new Promise((resolve) => setTimeout(resolve, 6000))
      assert.ok(watcher.running, errors.join('\n'))
      assert.doesNotMatch(
        errors.join('\n'),
        /ParserError|error CS\d|não é reconhecido|not recognized/i
      )
    } finally {
      console.warn = warn
      watcher.dispose()
    }
    assert.equal(watcher.running, false)
  }
)

test(
  'a voz no Windows: o whisper-cli.exe e o piper.exe pelo nome, pelo caminho e na pasta da voz',
  windowsOnly,
  async () => {
    const { findProgram, VOICE_DIR } = await import('../src/main/programs')
    const { findWhisper } = await import('../src/main/whisper')
    const bin = folder('voz-bin', { 'whisper-cli.exe': '', 'piper.exe': '' })
    const env = { Path: ['relativa', bin].join(';') }
    assert.equal(findWhisper('whisper-cli', env), join(bin, 'whisper-cli.exe'))
    assert.equal(findProgram('piper', ['piper', 'piper-tts'], [], env), join(bin, 'piper.exe'))
    // Um caminho do Windows, com ou sem o .exe.
    assert.equal(findWhisper(join(bin, 'whisper-cli'), {}), join(bin, 'whisper-cli.exe'))
    assert.equal(findWhisper(join(bin, 'whisper-cli.exe'), {}), join(bin, 'whisper-cli.exe'))
    assert.equal(findWhisper('relativa\\whisper-cli.exe', env), null)
    // Sem nada no PATH, na pasta da voz do Wisp (%LOCALAPPDATA%\Wisp\Voz\whisper).
    mkdirSync(join(VOICE_DIR, 'whisper'), { recursive: true })
    writeFileSync(join(VOICE_DIR, 'whisper', 'whisper-cli.exe'), '')
    assert.equal(findWhisper('whisper-cli', {}), join(VOICE_DIR, 'whisper', 'whisper-cli.exe'))
  }
)

// O PowerShell travava procurando o módulo do primeiro comando, conforme o ambiente de quem abria o
// Wisp (no CI, com o ambiente mínimo de um roteiro, parava no primeiro Get-Date): os scripts do
// Wisp carregam os módulos pelo caminho, sem procurar. Aqui, com esse mesmo ambiente mínimo.
test('o PowerShell responde mesmo com o ambiente mínimo', windowsOnly, async () => {
  const { MODULES, runPowerShell } = await import('../src/main/powershell')
  const saved = { ...process.env }
  const keep = new Set([
    'SYSTEMROOT',
    'SYSTEMDRIVE',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'PATH'
  ])
  for (const key of Object.keys(process.env))
    if (!keep.has(key.toUpperCase())) delete process.env[key]
  process.env.USERPROFILE = HOME
  process.env.APPDATA = join(HOME, 'AppData', 'Roaming')
  process.env.LOCALAPPDATA = join(HOME, 'AppData', 'Local')
  try {
    const started = Date.now()
    const result = await runPowerShell(
      '$null = Get-Process -Id $PID; $null = Get-Date; $x = @(1, 2) | Select-Object -First 1; ' +
        "Add-Type -TypeDefinition 'public static class Sonda { public static int Um() { return 1; } }'; " +
        'ConvertTo-Json -InputObject @([Sonda]::Um(), $env:PSModulePath) -Compress',
      {},
      15000
    )
    console.log(`com o ambiente mínimo: ${Date.now() - started} ms`)
    assert.equal(result.code, 0, result.stderr)
    const [one, modules] = JSON.parse(result.stdout.trim()) as [number, string]
    assert.equal(one, 1)
    assert.ok(modules.split(';').includes(MODULES), modules)
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

// A Fase 36: o que ainda faltava no Windows.

test('o navegador do Claude no Windows: o Chrome, o Edge e os outros onde os instaladores os põem', async () => {
  const { findBrowser, windowsBrowsers } = await import('../src/main/browser')
  const programs = folder('Program Files', {})
  const local = folder('AppData-Local', {})
  const env = {
    ProgramFiles: programs,
    'ProgramFiles(x86)': folder('Program Files (x86)', {}),
    LOCALAPPDATA: local,
    PATH: ''
  }
  const edge = join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  assert.ok(windowsBrowsers(env).includes(edge))
  // Só o Edge (o que vem com o Windows): é ele.
  mkdirSync(join(edge, '..'), { recursive: true })
  writeFileSync(edge, '', { mode: 0o755 })
  assert.deepEqual(findBrowser(null, env, true), { path: edge })
  // O Chrome instalado só para o usuário ganha do Edge.
  const chrome = join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
  mkdirSync(join(chrome, '..'), { recursive: true })
  writeFileSync(chrome, '', { mode: 0o755 })
  assert.deepEqual(findBrowser(null, env, true), { path: chrome })
  // O do config.json vale primeiro; fora do Windows, as pastas dele não contam.
  assert.deepEqual(findBrowser(edge, env, true), { path: edge })
  assert.ok('error' in findBrowser(null, env, false))
})

test('a linha de status no Windows: o próprio Wisp, numa linha do bash do Git, só com a ficha da aba', async () => {
  const { windowsStatusCommand } = await import('../src/main/claude-settings')
  const token = 'a'.repeat(32)
  assert.equal(
    windowsStatusCommand(
      'C:\\Users\\João Silva\\AppData\\Local\\Programs\\Wisp\\Wisp.exe',
      [],
      token
    ),
    `'C:/Users/João Silva/AppData/Local/Programs/Wisp/Wisp.exe' --wisp-hook --status ${token}`
  )
  // Sem espaço nem símbolo no caminho: sem aspas, e a mesma linha roda no PowerShell (Fase 40).
  assert.equal(
    windowsStatusCommand('C:\\Users\\joão\\AppData\\Local\\Programs\\Wisp\\Wisp.exe', [], token),
    `C:/Users/joão/AppData/Local/Programs/Wisp/Wisp.exe --wisp-hook --status ${token}`
  )
  assert.equal(
    windowsStatusCommand('D:\\dev\\electron.exe', ['D:\\dev\\wisp'], token),
    `D:/dev/electron.exe D:/dev/wisp --wisp-hook --status ${token}`
  )
  // Um símbolo que um dos shells leria de outro jeito volta para as aspas.
  for (const odd of ['C:\\Program Files\\Wisp.exe', 'C:\\a,b\\Wisp.exe', 'C:\\$x\\Wisp.exe'])
    assert.match(windowsStatusCommand(odd, [], token), /^'/, odd)
  // Rodando do código: o Electron e a pasta do app; um apóstrofo no caminho fica fechado.
  assert.equal(
    windowsStatusCommand('D:\\dev\\electron.exe', ["D:\\O'Neil\\wisp"], token),
    `'D:/dev/electron.exe' 'D:/O'\\''Neil/wisp' --wisp-hook --status ${token}`
  )
})

test(
  'trazer o terminal de uma sessão para a frente no Windows: pelos pais do processo até uma janela',
  windowsOnly,
  async () => {
    const { spawn } = await import('node:child_process')
    const { focusWindowsProcess, windowsWindows } = await import('../src/main/windows-win')
    // Um "terminal" (um formulário com título conhecido) que roda um "Claude Code" sem janela.
    const pidFile = join(HOME, 'filho.pid')
    const terminal = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "$c = Start-Process -FilePath ($env:SystemRoot + '\\System32\\PING.EXE') -ArgumentList '-n','60','127.0.0.1' -WindowStyle Hidden -PassThru; " +
          'Set-Content -Path $env:WISP_PID -Value $c.Id; ' +
          'Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; ' +
          "$f.Text = 'wisp-terminal-de-teste'; [System.Windows.Forms.Application]::Run($f)"
      ],
      { stdio: 'ignore', env: { ...process.env, WISP_PID: pidFile } }
    )
    let child = 0
    try {
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const windows = await windowsWindows()
        const shown = windows?.some((window) => window.title === 'wisp-terminal-de-teste')
        try {
          child = Number(readFileSync(pidFile, 'utf8').trim())
        } catch {
          child = 0
        }
        if (shown && child) break
      }
      assert.ok(child > 0, 'o "Claude Code" subiu')
      const result = await focusWindowsProcess(child)
      console.log(`trazer o terminal: ${result}`)
      // Achou a janela pelo pai (pode ser que o Windows não deixe trazer: "nao").
      assert.ok(result === 'ok' || result === 'nao', String(result))
      if (result === 'ok') {
        const active = (await windowsWindows())?.find((window) => window.active)
        assert.equal(active?.title, 'wisp-terminal-de-teste')
      }
      // Um processo que não existe não tem janela.
      assert.equal(await focusWindowsProcess(4_000_000), 'sem')
    } finally {
      try {
        if (child) process.kill(child)
      } catch {
        // Já saiu.
      }
      terminal.kill()
    }
  }
)

test(
  'a linha de status sem aspas roda igual no PowerShell e no bash do Git (Fase 40)',
  windowsOnly,
  async () => {
    const { spawnSync } = await import('node:child_process')
    const { existsSync } = await import('node:fs')
    const { windowsStatusCommand } = await import('../src/main/claude-settings')
    // No lugar do Wisp, o Node com um script que mostra os argumentos (na pasta do repositório,
    // sem espaço: a do HOME temporário tem o "~" do nome curto do Windows).
    const script = join(__dirname, 'eco-status.cjs')
    writeFileSync(script, 'console.log(JSON.stringify(process.argv.slice(2)))\n')
    const token = 'b'.repeat(32)
    const line = windowsStatusCommand(process.execPath, [script], token)
    console.log(`a linha: ${line}`)
    assert.ok(!line.includes("'"), 'sem aspas')
    const expected = ['--wisp-hook', '--status', token]
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', line], {
      encoding: 'utf8'
    })
    assert.deepEqual(JSON.parse(ps.stdout.trim()), expected, ps.stderr)
    const bash = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    if (!existsSync(bash)) return console.log('sem o Git Bash neste Windows')
    const sh = spawnSync(bash, ['-c', line], { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(sh.stdout.trim()), expected, sh.stderr)
  }
)

test(
  'o não perturbe do Windows (Fase 40): o botão do Windows 11 conta, e sem ele não está quieto',
  windowsOnly,
  async () => {
    const { runPowerShell } = await import('../src/main/powershell')
    const { QUIET } = await import('../src/main/media-win-watch')
    const key =
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings'
    const name = 'NOC_GLOBAL_SETTING_TOASTS_ENABLED'
    const ask = async (): Promise<{ quieto: boolean }> => {
      const result = await runPowerShell(
        QUIET + 'ConvertTo-Json -InputObject @{ quieto = (Quieto) } -Compress'
      )
      assert.equal(result.code, 0, result.stderr)
      return JSON.parse(result.stdout.trim()) as { quieto: boolean }
    }
    // Guarda o valor de antes (o runner pode não ter) e põe de volta no fim.
    const saved = await runPowerShell(
      `$v = [Microsoft.Win32.Registry]::GetValue('${key}', '${name}', $null); ` +
        "if ($null -eq $v) { 'nada' } else { [string]$v }"
    )
    const before = saved.stdout.trim()
    try {
      const normal = await ask()
      console.log(`sem mexer: ${JSON.stringify(normal)} (a chave: ${before})`)
      assert.equal(normal.quieto, before === '0', 'sem mexer, o que a chave diz')
      await runPowerShell(`[Microsoft.Win32.Registry]::SetValue('${key}', '${name}', 0)`)
      assert.equal((await ask()).quieto, true, 'com as notificações desligadas, quieto')
      await runPowerShell(`[Microsoft.Win32.Registry]::SetValue('${key}', '${name}', 1)`)
      assert.equal((await ask()).quieto, false, 'com as notificações ligadas, não')
    } finally {
      await runPowerShell(
        before === 'nada'
          ? `$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', $true); if ($k) { $k.DeleteValue('${name}', $false) }`
          : `[Microsoft.Win32.Registry]::SetValue('${key}', '${name}', ${Number(before)})`
      )
    }
  }
)

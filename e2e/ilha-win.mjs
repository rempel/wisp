// A ilha no Windows (Fase 37), num Windows de verdade: a janela no centro do topo da área útil, a
// ilha que abre, um pedido de permissão respondido por ela, e a música: o PowerShell que acompanha
// o controle de mídia do Windows fica aberto (e o roteiro mostra quanto ele gasta), e um player de
// verdade (o MediaPlayer do próprio Windows, tocando um som gerado aqui) aparece na ilha, quando o
// Windows do CI deixa (sem aparelho de som, ele pode não deixar: aí essas verificações ficam de
// fora, ditas na saída). Fora do Windows, não há o que testar.
// Uso: node e2e/ilha-win.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  checks,
  connect,
  IS_WINDOWS,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

if (!IS_WINDOWS) {
  console.log('só no Windows')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome({ compact: true })
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const powershell = (script) =>
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true
  })

const mascot = await startApp(home)
const ev = (expression) => mascot.evaluate(expression)
const shoot = async (name) => {
  if (!SHOTS) return
  await sleep(400)
  const box = await ev(
    `(() => { const r = document.querySelector('.island').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`
  )
  const { data } = await mascot.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 }
  })
  if (data) writeFileSync(join(SHOTS, `ilha-${name}.png`), Buffer.from(data, 'base64'))
}
const mode = () =>
  ev(
    `[...(document.querySelector('.island')?.classList ?? [])].find(c => c.startsWith('mode-'))?.slice(5) ?? null`
  )
const act = (action) => ev(`window.wisp.mascot.island(${JSON.stringify(action)})`)
const text = (selector) =>
  ev(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`)

console.log('== A ilha no topo')
await waitFor(() => ev(`!!document.querySelector('.island')`), 10000)
const place = await ev(
  `({ x: window.screenX, y: window.screenY, w: innerWidth, h: innerHeight, left: screen.availLeft, top: screen.availTop, width: screen.availWidth })`
)
check(
  'W1 a janela da ilha no centro do topo da área útil',
  place.w === 680 &&
    place.h === 340 &&
    Math.abs(place.x - (place.left + (place.width - 680) / 2)) <= 1 &&
    place.y === place.top + 4,
  JSON.stringify(place)
)
await waitFor(async () => (await mode()) === 'compact', 10000)
await shoot('windows-recolhida')
await act({ type: 'open' })
check('W2 ela abre', !!(await waitFor(async () => (await mode()) === 'open', 4000)))
await act({ type: 'tab', tab: 'settings' })
const settings = await waitFor(() => text('.island-card.settings'), 3000)
check(
  'W3 os ajustes, sem a opção das capas da internet (no Windows, elas vêm do sistema)',
  /Recolher depois de/.test(settings ?? '') && !/Capas/.test(settings ?? ''),
  settings
)
await act({ type: 'tab', tab: 'home' })
await act({ type: 'close' })

console.log('== O PowerShell que acompanha a música')
const watcher = await waitFor(() => {
  const found = powershell(
    'Get-CimInstance Win32_Process -Filter "Name = \'powershell.exe\'" | ' +
      "Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*GlobalSystemMediaTransportControlsSessionManager*' -and $_.CommandLine -like '*ReadLineAsync*' } | " +
      'ForEach-Object { "$($_.ProcessId) $([math]::Round($_.WorkingSetSize / 1MB))" }'
  ).stdout.trim()
  return found || null
}, 20000)
const musicLog = () => {
  try {
    return readFileSync(join(home.home, 'wisp.log'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('música'))
      .slice(-5)
      .join('\n')
  } catch {
    return ''
  }
}
check(
  'W4 um PowerShell só, acompanhando o controle de mídia',
  !!watcher && watcher.split('\n').length === 1,
  `${watcher}\n${musicLog()}`
)
const [watcherPid, watcherMb] = (watcher ?? '0 0').split(' ').map(Number)
console.log(`  o PowerShell da música: pid ${watcherPid}, ${watcherMb} MB de memória`)
// O que ele gasta de CPU parado: a soma em 10 s (o laço lê o controle de mídia a cada 4 s).
const cpu = () =>
  Number(
    powershell(`(Get-Process -Id ${watcherPid}).TotalProcessorTime.TotalMilliseconds`).stdout.trim()
  )
const before = cpu()
await sleep(10000)
const spent = cpu() - before
console.log(`  CPU em 10 s, parado: ${spent.toFixed(0)} ms`)
check('W5 parado, ele quase não gasta CPU (menos de 3% de um núcleo)', spent < 300, `${spent} ms`)

console.log('== Um player de verdade')
// Um som de 30 s (um tom baixinho) e o MediaPlayer do Windows tocando, com o título na tela de
// mídia do Windows (o SystemMediaTransportControls dele).
const wav = join(home.home, 'som.wav')
const rate = 8000
const samples = rate * 30
const buffer = Buffer.alloc(44 + samples * 2)
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + samples * 2, 4)
buffer.write('WAVEfmt ', 8)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20)
buffer.writeUInt16LE(1, 22)
buffer.writeUInt32LE(rate, 24)
buffer.writeUInt32LE(rate * 2, 28)
buffer.writeUInt16LE(2, 32)
buffer.writeUInt16LE(16, 34)
buffer.write('data', 36)
buffer.writeUInt32LE(samples * 2, 40)
for (let i = 0; i < samples; i++) {
  buffer.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 300), 44 + i * 2)
}
writeFileSync(wav, buffer)
const player = spawn(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime; ' +
      '$null = [Windows.Media.Playback.MediaPlayer,Windows.Media,ContentType=WindowsRuntime]; ' +
      '$null = [Windows.Media.Core.MediaSource,Windows.Media.Core,ContentType=WindowsRuntime]; ' +
      '$p = New-Object Windows.Media.Playback.MediaPlayer; ' +
      '$p.Source = [Windows.Media.Core.MediaSource]::CreateFromUri([Uri]$env:WISP_SOM); ' +
      '$p.IsLoopingEnabled = $true; ' +
      '$u = $p.SystemMediaTransportControls.DisplayUpdater; ' +
      '$u.Type = [Windows.Media.MediaPlaybackType]::Music; ' +
      "$u.MusicProperties.Title = 'Canção da Ilha'; $u.MusicProperties.Artist = 'Wisp e Banda'; " +
      '$u.Update(); $p.Play(); ' +
      "Write-Output 'tocando'; Start-Sleep -Seconds 120"
  ],
  {
    env: { ...process.env, WISP_SOM: pathToFileURL(wav).href },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }
)
let playerErr = ''
player.stderr.on('data', (chunk) => (playerErr += chunk))
await act({ type: 'open' })
const card = await waitFor(async () => {
  const value = await text('.island-card.music')
  return value && /Canção da Ilha/.test(value) ? value : null
}, 25000)
if (!card) {
  console.log(
    `  pulado: o Windows do CI não mostrou o player na mídia do sistema${playerErr ? ` (${playerErr.trim().split('\n')[0]})` : ''}`
  )
} else {
  await shoot('windows-musica')
  check(
    'M1 o player do Windows aparece na ilha, com o título e o artista',
    /Wisp e Banda/.test(card),
    card
  )
  // O que o próprio Windows diz do player (o CI pode não ter aparelho de som para tocar).
  const raw = () =>
    powershell(
      'Add-Type -AssemblyName System.Runtime.WindowsRuntime; ' +
        "$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and " +
        "$_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]; " +
        '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]; ' +
        '$t = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, ' +
        '@([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())); [void]$t.Wait(-1); ' +
        'foreach ($s in $t.Result.GetSessions()) { "$($s.SourceAppUserModelId)=$($s.GetPlaybackInfo().PlaybackStatus)" }'
    ).stdout.trim()
  const status = () => ev(`document.querySelector('.island-card.music')?.dataset.status ?? null`)
  await sleep(2000)
  const windows = raw()
  console.log(`  o player, pelo Windows: ${windows || '(nada)'}; na ilha: ${await status()}`)
  if (!/=Playing/.test(windows)) {
    console.log(
      '  pulado: o player do CI não tocou (sem aparelho de som): a dança e o pausar ficam de fora'
    )
    check('M2 a ilha mostra o player parado, como o Windows', (await status()) !== 'Playing')
  } else {
    check(
      'M2 tocando, a ilha diz que toca e o mascote dança no Windows',
      (await status()) === 'Playing' &&
        !!(await waitFor(() => ev(`!!document.querySelector('.stage.music')`), 10000))
    )
    await ev(`document.querySelector('.island-card.music button[aria-label="Pausar"]')?.click()`)
    const paused = await waitFor(async () => ((await status()) === 'Paused' ? true : null), 10000)
    check('M3 pausar pela ilha (pelo PowerShell que acompanha a música)', !!paused, `${raw()}`)
  }
}
player.kill()
await act({ type: 'close' })

console.log('== Perguntar pela ilha, com o teclado (Fase 38)')
await sleep(500)
await act({ type: 'open' })
await waitFor(async () => ((await mode()) === 'open' ? true : null), 4000)
// No Início, a ilha não pega o teclado (ela não rouba o foco de quem está digitando). Só
// anotado: um comando de entrada do DevTools pode dar o foco à página por conta própria.
console.log(`  aberta no Início, a página com o foco: ${await ev(`document.hasFocus()`)}`)
await act({ type: 'tab', tab: 'ask' })
check(
  'Q1 no Windows, a ilha pega o teclado: a caixa de perguntar com o foco',
  !!(await waitFor(
    () =>
      ev(
        `document.hasFocus() && document.activeElement?.classList.contains('ask-input') ? true : null`
      ),
    5000
  ))
)
await mascot.send('Input.insertText', { text: 'testa [edit] oi' })
for (const type of ['keyDown', 'keyUp']) {
  await mascot.send('Input.dispatchKeyEvent', {
    type,
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13
  })
}
const answered = await waitFor(async () => {
  const value = await text('.island-card.ask-card')
  return /Tudo certo por aqui/.test(value ?? '') ? value : null
}, 15000)
check(
  'Q2 o Enter manda, e a resposta aparece na ilha com o passo da edição',
  !!answered && /Editar app\.ts/.test(answered),
  answered ?? (await text('.island-card.ask-card'))
)
await shoot('windows-perguntar')
await act({ type: 'tab', tab: 'home' })
check(
  'Q3 de volta ao Início, ela continua com o teclado (o Esc e as setas)',
  !!(await waitFor(
    () => ev(`document.hasFocus() && !document.querySelector('.ask-input') ? true : null`),
    3000
  ))
)
for (const type of ['keyDown', 'keyUp']) {
  await mascot.send('Input.dispatchKeyEvent', {
    type,
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27
  })
}
check(
  'Q4 o Esc recolhe a ilha (e ela devolve o teclado)',
  !!(await waitFor(async () => ((await mode()) !== 'open' ? true : null), 4000))
)

console.log('== Um pedido de permissão')
wisp(home, '--show')
const chat = await connect('/chat/')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 20000)
const conversation = await chat.evaluate(`document.querySelector('.pane').dataset.conversation`)
await chat.evaluate(`window.wisp.chat.hide()`)
await sleep(300)
await chat.evaluate(
  `window.wisp.chat.send(${JSON.stringify(conversation)}, 'testa [pede dir]', [])`
)
check(
  'P1 com o painel escondido, a ilha abre com o pedido',
  !!(await waitFor(async () => /dir/.test((await text('.island-card.alert pre')) ?? ''), 15000))
)
await shoot('windows-pedido')
await sleep(800)
await ev(
  `[...document.querySelectorAll('.island-card.alert button')].find(b => b.textContent.trim() === 'Permitir')?.click()`
)
check(
  'P2 respondido pela ilha, ela recolhe',
  !!(await waitFor(async () => (await mode()) !== 'open', 8000))
)
wisp(home, '--show')
const transcript = await waitFor(async () => {
  const value = await chat.evaluate(`document.querySelector('.pane .messages')?.innerText ?? ''`)
  return /Permitido pela ilha/.test(value) && /Rodei dir/.test(value) ? value : null
}, 10000)
check('P3 e o Claude segue', !!transcript)
check(
  'P4 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
// O PowerShell da música fecha com o Wisp (a entrada dele acaba).
const left = await waitFor(() => {
  const alive = powershell(
    `Get-Process -Id ${watcherPid} -ErrorAction SilentlyContinue`
  ).stdout.trim()
  return alive ? null : true
}, 10000)
check('W6 o PowerShell da música fecha junto com o Wisp', left === true)
try {
  home.remove()
} catch (err) {
  console.log(`a pasta de teste ficou: ${err.message}`)
}
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)

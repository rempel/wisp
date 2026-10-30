// As integrações do Windows (Fase 35), num Windows de verdade: as ferramentas do Claude que falam
// com o Windows, chamadas pelo servidor MCP do Wisp como o Claude Code chama. As janelas abertas
// (a do Bloco de Notas que o roteiro abre) e trazer uma para a frente; o terminal na pasta
// pessoal (e só nela ou nas de projetos); os apps do menu Iniciar (um atalho que o roteiro cria);
// a música (o controle de mídia do Windows) e o volume (sem aparelho de som no CI, o erro do
// Windows, não um do script); e o diagnóstico acha o terminal. Fora do Windows, não há o que
// testar.
// Uso: node e2e/integracoes.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  checks,
  connect,
  dataDir,
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
const home = testHome()
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const powershell = (script) =>
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true
  })
// A tela toda (o Bloco de Notas na frente, o terminal aberto).
const shoot = (name) => {
  if (!SHOTS) return
  const file = join(SHOTS, `${name}-tela.png`).replaceAll("'", "''")
  powershell(
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
      '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen; ' +
      '$i = New-Object System.Drawing.Bitmap $b.Width, $b.Height; ' +
      '$g = [System.Drawing.Graphics]::FromImage($i); ' +
      '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $i.Size); ' +
      `$i.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`
  )
}

// Um atalho no menu Iniciar do usuário de teste: o Bloco de Notas com um arquivo de nome conhecido.
const notes = join(home.home, 'wisp-e2e-app.txt')
writeFileSync(notes, 'aberto pelo open_app\r\n')
const menu = join(home.home, 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Wisp E2E')
mkdirSync(menu, { recursive: true })
const made = powershell(
  `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${join(menu, 'Notas do Wisp.lnk').replaceAll("'", "''")}'); ` +
    `$s.TargetPath = 'notepad.exe'; $s.Arguments = '"${notes}"'; $s.Save()`
)
if (made.status !== 0) console.log(made.stderr)

const started = new Date()
await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 20000)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)
await ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, 'oi', [])`)

// O servidor MCP da conversa: o endereço e o token estão no --mcp-config dela.
const run = join(dataDir(home.home), 'Run')
const file = await waitFor(
  () => readdirSync(run).find((name) => /^mcp-\d+-.+\.json$/.test(name)),
  20000
)
const desktop = JSON.parse(readFileSync(join(run, file), 'utf8')).mcpServers.desktop
const call = async (name, args = {}) => {
  const begin = Date.now()
  const response = await fetch(desktop.url, {
    method: 'POST',
    headers: {
      ...desktop.headers,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    })
  })
  const body = await response.text()
  const data = body.split('\n').find((line) => line.startsWith('data:'))
  const result = JSON.parse(data ? data.slice(5) : body).result
  const text = result.content.map((part) => part.text ?? '').join('\n')
  console.log(`  ${name} (${Date.now() - begin} ms): ${text.split('\n').slice(0, 8).join(' | ')}`)
  return { text, error: !!result.isError }
}

console.log('== As janelas')
const target = join(home.home, 'wisp-e2e-janela.txt')
writeFileSync(target, 'a janela do teste\r\n')
const notepad = spawn('notepad.exe', [target], { stdio: 'ignore' })
const listed = await waitFor(
  async () => {
    const windows = await call('list_windows')
    return /wisp-e2e-janela/.test(windows.text) ? windows : null
  },
  30000,
  1000
)
check('I1 list_windows mostra a janela do Bloco de Notas', !!listed && !listed.error, listed?.text)
check(
  'I2 sem as janelas do próprio Wisp',
  !!listed && !/Wisp:|“Wisp”/.test(listed.text),
  listed?.text
)
// O painel na frente; o focus_window traz o Bloco de Notas.
wisp(home, '--show')
await sleep(800)
const focused = await call('focus_window', { janela: 'wisp-e2e-janela' })
check(
  'I3 focus_window traz a janela para a frente',
  !focused.error && /Trouxe para a frente/.test(focused.text),
  focused.text
)
const after = await call('list_windows')
const line = after.text.split('\n').find((l) => /wisp-e2e-janela/.test(l)) ?? ''
check('I4 e ela fica ativa', /\(ativa/.test(line), line)
shoot('janela-na-frente')
const missing = await call('focus_window', { janela: 'nenhuma-janela-assim' })
check(
  'I5 uma janela que não existe é um erro com as abertas',
  missing.error && /Nenhuma janela bate/.test(missing.text),
  missing.text
)

console.log('== O terminal')
const before = await call('list_windows')
const opened = await call('open_terminal', {})
check(
  'I6 open_terminal abre um terminal na pasta pessoal',
  !opened.error && /^Abri o .+ em /.test(opened.text) && opened.text.includes(basename(home.home)),
  opened.text
)
const newWindow = await waitFor(
  async () => {
    const now = await call('list_windows')
    const fresh = now.text.split('\n').filter((l) => l && !before.text.includes(l))
    return fresh.length ? fresh.join('\n') : null
  },
  20000,
  1000
)
check('I7 a janela do terminal aparece', !!newWindow, newWindow)
shoot('terminal')
const outside = await call('open_terminal', { path: 'C:\\Windows' })
check(
  'I8 fora da pasta pessoal e dos projetos, não abre',
  outside.error && /fica fora da pasta pessoal/.test(outside.text),
  outside.text
)

console.log('== Os apps do menu Iniciar')
const apps = await call('list_apps', { busca: 'notas do wisp' })
check(
  'I9 list_apps acha o atalho do menu Iniciar',
  /Wisp E2E\/Notas do Wisp/.test(apps.text),
  apps.text
)
const app = await call('open_app', { id: 'Wisp E2E/Notas do Wisp' })
check('I10 open_app abre o atalho', !app.error && /Abri Notas do Wisp/.test(app.text), app.text)
const appWindow = await waitFor(
  async () => {
    const now = await call('list_windows')
    return /wisp-e2e-app/.test(now.text) ? now.text : null
  },
  20000,
  1000
)
check('I11 a janela do app aberto aparece', !!appWindow, appWindow)

console.log('== A música e o volume')
const status = await call('media_status')
check(
  'I12 media_status responde pelo controle de mídia do Windows',
  !status.error && (/Nenhum player/.test(status.text) || /^- /.test(status.text)),
  status.text
)
const volume = await call('media_volume', { mudar: 0 })
check(
  'I13 media_volume muda o volume do sistema (ou diz o erro do Windows)',
  /o volume do sistema ficou em \d+%/.test(volume.text) ||
    (/Não consegui mudar o volume do Windows/.test(volume.text) &&
      !/error CS\d|ParserError|not recognized|não é reconhecido/i.test(volume.text)),
  volume.text
)

console.log('== O diagnóstico')
const snapshot = await ev(`window.wisp.diagnostics.run()`)
const terminal = snapshot?.checks?.find((c) => c.id === 'terminal')
check('I14 o diagnóstico acha o terminal', terminal?.status === 'ok', JSON.stringify(terminal))

notepad.kill()
await stopApp()
// Os terminais e os Bloco de Notas que o roteiro abriu.
powershell(
  `Get-Process notepad, pwsh, powershell, cmd, WindowsTerminal -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.StartTime -gt [datetime]'${started.toISOString()}' -and $_.MainWindowHandle -ne 0 } | ` +
    `Stop-Process -Force -ErrorAction SilentlyContinue`
)
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)

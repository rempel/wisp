// O essencial, em qualquer sistema (Fase 33): no Linux, junto com os outros roteiros; no Windows,
// no job do CI de lá. O app abre com o config.json do lugar do sistema, uma conversa com o Claude
// Code de mentira funciona, o hook que manda todo Bash para o card é o do sistema (no Windows, a
// forma exec rodando o próprio Wisp, sem shell) e responde certo, um comando pede pelo card, o
// modo terminal abre o Claude Code num pty (e ele sai ao voltar ao chat), o diagnóstico acha o
// Claude Code, e o registro fica na pasta do sistema, sem erros.
// Uso: node e2e/essencial.mjs (no Linux, veja e2e/run.sh).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appEnv,
  checks,
  connect,
  dataDir,
  ELECTRON,
  IS_WINDOWS,
  ROOT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
// Os prints (no CI do Windows, um artefato): o painel pelo DevTools e, no Windows, a tela toda.
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shoot = async (page, name) => {
  if (!SHOTS) return
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  if (data) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'))
  if (!IS_WINDOWS) return
  const file = join(SHOTS, `${name}-tela.png`).replaceAll("'", "''")
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
        '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen; ' +
        '$i = New-Object System.Drawing.Bitmap $b.Width, $b.Height; ' +
        '$g = [System.Drawing.Graphics]::FromImage($i); ' +
        '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $i.Size); ' +
        `$i.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`
    ],
    { timeout: 30000, windowsHide: true }
  )
}
const spawns = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/spawns.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

console.log(`== Abrir (${process.platform})`)
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
const composer = await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 20000)
check('E1 o mascote e o painel abrem', composer === true)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)

console.log('== Conversar')
await ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, 'oi', [])`)
// A resposta chega aos pedaços: espera o texto inteiro, e não o primeiro pedaço.
let reply = null
await waitFor(async () => {
  reply = await ev(`document.querySelector('.pane .msg.assistant')?.innerText ?? null`)
  return /Oi! Tudo certo/.test(reply ?? '') || null
}, 20000)
check('E2 o Claude Code responde', /Oi! Tudo certo/.test(reply ?? ''), reply)
await shoot(chat, 'conversa')

const hook = spawns().at(-1)?.bashHook ?? {}
check(
  'E3 o hook do Bash é o do sistema',
  IS_WINDOWS
    ? Array.isArray(hook.args) &&
        hook.args.at(-1) === '--wisp-mode-hook' &&
        existsSync(hook.command)
    : /WISP_PERMISSION_MODE_FILE/.test(hook.command ?? ''),
  JSON.stringify(hook)
)

// O hook do Bash como o Claude Code o roda no Windows: o executável do Wisp, sem shell.
const modeFile = join(home.home, 'modo')
const runHook = (mode) => {
  writeFileSync(modeFile, mode)
  // Como root no Linux (o contêiner do CI), o Electron só abre sem o sandbox.
  const extra = IS_WINDOWS ? [] : ['--no-sandbox']
  const { stdout } = spawnSync(ELECTRON, [ROOT, '--wisp-mode-hook', ...extra], {
    env: { ...appEnv(home), WISP_PERMISSION_MODE_FILE: modeFile },
    encoding: 'utf8',
    timeout: 30000
  })
  // No Windows, o Electron escreve uma linha em branco ao abrir; o Claude Code apara a saída do
  // hook antes de ler o JSON, e o roteiro lê do mesmo jeito.
  return stdout?.trim()
}
const asked = runHook('default\n')
const quiet = runHook('auto\n')
check(
  'E4 o Wisp responde o hook: pede no modo Pedir, e fica quieto no Automático',
  /"permissionDecision":"ask"/.test(asked ?? '') && quiet === '',
  JSON.stringify({ asked, quiet })
)

console.log('== Um comando pede pelo card')
await waitFor(
  async () => !(await ev(`document.querySelector('.header .status')?.classList.contains('busy')`)),
  15000
)
await ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, 'testa [pede npm test]', [])`)
const card = await waitFor(
  () => ev(`document.querySelector('.pane .permission-pending')?.innerText ?? null`),
  15000
)
check('E5 o card aparece com o comando', /npm test/.test(card ?? ''), card)
await shoot(chat, 'card')
await sleep(1200)
await ev(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Negar')?.click()`
)
const denied = await waitFor(
  async () => !(await ev(`document.querySelector('.pane .permission-pending') !== null`)),
  10000
)
check('E6 negado no card, o Claude segue', denied === true)

console.log('== O modo terminal')
await waitFor(
  async () => !(await ev(`document.querySelector('.header .status')?.classList.contains('busy')`)),
  15000
)
await ev(
  `[...document.querySelectorAll('.pane .view-toggle button')].find(b => b.textContent.includes('Terminal'))?.click()`
)
const screen = await waitFor(async () => {
  const text = await ev(
    `[...document.querySelectorAll('.pane .xterm-rows > div')].map(d => d.textContent).join('\\n')`
  )
  // O prompt (">") sai depois de o Claude Code ligar o modo cru: antes dele, o Enter chegaria
  // como uma quebra de linha.
  return /Claude Code de mentira \(terminal\)[\s\S]*\n>/.test(text ?? '') ? text : null
}, 20000)
check('E7 o Claude Code abre no terminal da aba (pty)', !!screen, screen)
// Um pedido de permissão no terminal vira o card do Wisp, pelo relay dos hooks (no Windows, o
// próprio Wisp na forma exec, pelo pipe nomeado).
await ev(
  `window.wisp.tui.input(${JSON.stringify(conversation)}, ${JSON.stringify('roda [pede ls -la]\r')})`
)
const terminalCard = await waitFor(
  () => ev(`document.querySelector('.terminal-cards .permission-pending')?.innerText ?? null`),
  20000
)
await shoot(chat, 'terminal')
// Sem o card, os hooks que o Claude Code do terminal rodou e quanto cada um levou.
const tuiHooks = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/tui.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter(
        (entry) => entry.start || entry.line || entry.hook || entry.hookDone || entry.decision
      )
  } catch {
    return []
  }
}
check(
  'E7b o pedido do terminal vira o card do Wisp',
  /ls -la/.test(terminalCard ?? ''),
  terminalCard ?? JSON.stringify(tuiHooks())
)
await sleep(800)
await ev(
  `[...document.querySelectorAll('.terminal-cards .permission-pending button')].find(b => b.textContent.trim() === 'Permitir')?.click()`
)
const ran = await waitFor(async () => {
  const text = await ev(
    `[...document.querySelectorAll('.pane .xterm-rows > div')].map(d => d.textContent).join('\\n')`
  )
  return /Rodei ls -la\./.test(text ?? '') ? text : null
}, 15000)
check('E7c permitido no card, o terminal segue', !!ran)
await waitFor(
  async () => !(await ev(`document.querySelector('.header .status')?.classList.contains('busy')`)),
  15000
)
// De volta ao chat, o processo do terminal sai (no Windows, o node-pty não manda sinais).
const tui = spawns()
  .filter((spawn) => !spawn.args.includes('-p'))
  .at(-1)?.pid
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}
await ev(
  `[...document.querySelectorAll('.pane .view-toggle button')].find(b => b.textContent.includes('Chat'))?.click()`
)
const gone = !!tui && (await waitFor(() => !alive(tui), 10000))
check('E8 de volta ao chat, o Claude Code do terminal sai', gone === true, String(tui))

console.log('== O diagnóstico')
const snapshot = await ev(`window.wisp.diagnostics.run()`)
const claude = snapshot?.checks?.find((item) => item.id === 'claude')
check('E9 o diagnóstico acha o Claude Code', claude?.status === 'ok', JSON.stringify(claude))

const log = IS_WINDOWS
  ? join(dataDir(home.home), 'Logs/wisp.log')
  : join(home.home, '.local/state/wisp/wisp.log')
check('E10 o registro fica na pasta do sistema', existsSync(log), log)
// O que é de um desktop Linux (o D-Bus, o X11, os portais) fica quieto onde não há: nenhum erro.
const problems = existsSync(log)
  ? readFileSync(log, 'utf8')
      .split('\n')
      .filter((line) => / (WARN|ERROR) /.test(line))
  : []
if (problems.length) console.log(problems.join('\n'))
check('E11 o registro sem erros', !problems.some((line) => / ERROR /.test(line)))
check(
  'E12 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)

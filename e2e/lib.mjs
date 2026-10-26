// Apoio aos testes de ponta a ponta: abre o Wisp montado (out/) num HOME temporário, com o Claude
// Code de mentira (test/fixtures/fake-claude), e fala com as páginas pelo DevTools.
// Precisa de um servidor X (DISPLAY) e de um barramento D-Bus de sessão; no CI, o e2e/run.sh
// sobe os dois.
import { spawn, execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname
export const ELECTRON = join(ROOT, 'node_modules/electron/dist/electron')
export const FAKE_CLAUDE = join(ROOT, 'test/fixtures/fake-claude')
export const PORT = 9333

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function waitFor(fn, ms = 10000, every = 100) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const value = await fn()
    if (value) return value
    await sleep(every)
  }
  return null
}

/** As verificações de um roteiro: todas rodam, e a saída diz quais falharam. */
export function checks() {
  let failed = 0
  const check = (name, ok, extra = '') => {
    if (!ok) failed++
    console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra)
  }
  return { check, failed: () => failed }
}

/** Uma página do app (pelo trecho da URL), pelo protocolo do DevTools. */
export async function connect(match, ms = 15000) {
  let target
  const start = Date.now()
  while (!target && Date.now() - start < ms) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      target = list.find((item) => item.type === 'page' && item.url.includes(match))
    } catch {
      // O app ainda está abrindo.
    }
    if (!target) await sleep(200)
  }
  if (!target) throw new Error(`a página ${match} não apareceu`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve))
  let id = 0
  const pending = new Map()
  const logs = []
  let closed = false
  // O app fechou (ou caiu): quem esperava uma resposta recebe uma vazia, em vez de esperar para
  // sempre (o roteiro segue e as conferências dizem o que faltou).
  ws.addEventListener('close', () => {
    closed = true
    for (const resolve of pending.values()) resolve({})
    pending.clear()
  })
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data.result ?? data.error)
      pending.delete(data.id)
    }
    if (data.method === 'Runtime.exceptionThrown') {
      logs.push(`exceção: ${data.params.exceptionDetails.exception?.description}`)
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      logs.push(`erro: ${data.params.args.map((arg) => arg.value ?? arg.description).join(' ')}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      if (closed) return resolve({})
      pending.set(++id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      ?.value
  return { send, evaluate, logs, close: () => ws.close() }
}

/**
 * Um HOME de teste, com o config.json apontando para o Claude Code de mentira, e uma pasta de
 * runtime só do usuário (o socket dos hooks e os arquivos do MCP ficam nela).
 */
export function testHome(config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'wisp-e2e-'))
  const runtime = join(home, 'run')
  mkdirSync(runtime, { mode: 0o700 })
  chmodSync(runtime, 0o700)
  mkdirSync(join(home, '.config/wisp'), { recursive: true })
  writeFileSync(
    join(home, '.config/wisp/config.json'),
    JSON.stringify({
      claudePath: FAKE_CLAUDE,
      sleepAfterMinutes: 10,
      accessory: 'none',
      sound: false,
      ...config
    })
  )
  // Os primeiros passos (Fase 20) já vistos: cada roteiro abre direto na conversa. O
  // e2e/primeiros-passos.mjs apaga o arquivo para ver a primeira vez.
  mkdirSync(join(home, '.local/share/wisp'), { recursive: true })
  writeFileSync(join(home, '.local/share/wisp/boas-vindas.json'), '{"done":"e2e"}')
  return { home, runtime, remove: () => rmSync(home, { recursive: true, force: true }) }
}

/** O ambiente do app: só o necessário, como um login novo (nada do terminal de quem testa). */
export function appEnv({ home, runtime }, extra = {}) {
  return {
    HOME: home,
    PATH: process.env.PATH,
    DISPLAY: process.env.DISPLAY ?? ':99',
    ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? '',
    XDG_RUNTIME_DIR: runtime,
    LANG: 'pt_BR.UTF-8',
    TZ: 'America/Sao_Paulo',
    ...extra
  }
}

let app = null

/** O pid do processo principal do Wisp aberto pelo startApp (null: fechado). */
export const appPid = () => app?.pid ?? null

/** Abre o Wisp e espera o mascote aparecer (`args`: opções a mais do Chromium). */
export async function startApp(home, extra = {}, args = []) {
  await stopApp()
  // A saída do app fica num arquivo do HOME de teste, para ver o que houve se algo falhar.
  const log = openSync(join(home.home, 'wisp.log'), 'a')
  app = spawn(
    ELECTRON,
    [ROOT, '--no-sandbox', '--ozone-platform=x11', `--remote-debugging-port=${PORT}`, ...args],
    { env: appEnv(home, extra), stdio: ['ignore', log, log], detached: true }
  )
  let mascot
  try {
    mascot = await connect('/mascot/', 30000)
  } catch (err) {
    console.error(
      readFileSync(join(home.home, 'wisp.log'), 'utf8').split('\n').slice(-30).join('\n')
    )
    throw err
  }
  await waitFor(() => mascot.evaluate(`!!document.querySelector('.stage')`), 15000)
  return mascot
}

/** Fecha o Wisp (o grupo de processos inteiro) e espera ele sair. */
export async function stopApp() {
  if (!app) return
  const child = app
  app = null
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Já saiu.
    }
    const done = await Promise.race([exited.then(() => true), sleep(8000)])
    if (!done) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Já saiu.
      }
    }
  }
  // A porta do DevTools é liberada um pouco depois.
  await sleep(500)
}

/** Roda o comando `wisp` que o app escreveu no HOME (--show, --ask, --toggle…). */
export function wisp(home, ...args) {
  const launcher = join(home.home, '.local/share/wisp/bin/wisp')
  if (!existsSync(launcher)) throw new Error('o comando wisp ainda não foi escrito')
  try {
    execFileSync(launcher, ['--no-sandbox', ...args], {
      env: appEnv(home),
      stdio: 'ignore',
      timeout: 20000
    })
  } catch {
    // O comando sai com erro quando entrega o pedido ao Wisp já aberto; o que vale é o efeito.
  }
}

/** Roda o relay dos hooks como o Claude Code roda (um evento, o JSON no stdin). */
export function relay(home, event, input, stdio = ['pipe', 'ignore', 'ignore']) {
  const child = spawn(ELECTRON, [join(ROOT, 'out/main/wisp-hook.js'), event], {
    env: { ...appEnv(home), ELECTRON_RUN_AS_NODE: '1' },
    stdio
  })
  child.stdin.end(JSON.stringify({ hook_event_name: event, ...input }))
  return child
}

/** As linhas de um log do Claude Code de mentira (spawns, controls, approvals). */
export function fakeLog(home, name) {
  const file = join(home.home, '.fake-claude', `${name}.log`)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
}

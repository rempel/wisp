// Os hooks do Claude Code: o instalador mexe no ~/.claude/settings.json só com prévia, backup e
// a impressão digital do que o usuário viu; o relay (rodado como o Claude Code roda) entrega os
// eventos ao servidor do app e devolve a decisão de um pedido de permissão.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  applyHooks,
  deployRelay,
  hooksStatus,
  previewHooks,
  settingsPath,
  WRAPPER_PATH
} from '../src/main/hooks/install'
import { startHookServer } from '../src/main/hooks/server'
import type { HookServer, PendingReply } from '../src/main/hooks/server'
import type { RelayEvent } from '../src/main/hooks/protocol'
import type { HookPreview } from '../src/shared/ipc'
import { RELAY } from './helpers/paths'

const SETTINGS = join(HOME, '.claude', 'settings.json')
const preview = (action: 'install' | 'uninstall'): HookPreview => {
  const result = previewHooks(action)
  assert.ok(!('error' in result), JSON.stringify(result))
  return result
}

test('instalar: prévia com o diff, backup, e as entradas do usuário ficam', () => {
  assert.equal(settingsPath(), SETTINGS)
  mkdirSync(join(HOME, '.claude'), { recursive: true })
  const mine = {
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify-send pronto' }] }] },
    model: 'opus'
  }
  writeFileSync(SETTINGS, JSON.stringify(mine, null, 4) + '\n', { mode: 0o600 })
  assert.equal(hooksStatus().installed, false)
  const before = preview('install')
  assert.ok(before.changes)
  assert.match(
    before.backupPath ?? '',
    /^~\/\.claude\/settings\.json\.backup-wisp-\d{4}-\d\d-\d\d-\d{6}$/
  )
  assert.ok(
    before.diff.some((hunk) =>
      hunk.lines.some((line) => line.startsWith('+') && line.includes('wisp-hook'))
    )
  )
  // Nada é gravado na prévia.
  assert.deepEqual(JSON.parse(readFileSync(SETTINGS, 'utf8')), mine)
  const done = applyHooks('install', before.fingerprint)
  assert.ok('ok' in done, JSON.stringify(done))
  const after = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  assert.equal(after.model, 'opus')
  assert.equal(after.hooks.Stop[0].hooks[0].command, 'notify-send pronto', 'a do usuário vem antes')
  assert.match(after.hooks.Stop[1].hooks[0].command, /wisp-hook' Stop$/)
  assert.equal(
    after.hooks.PermissionRequest[0].hooks[0].async,
    undefined,
    'o pedido espera o relay'
  )
  assert.equal(after.hooks.PreToolUse[0].hooks[0].async, true)
  assert.match(readFileSync(SETTINGS, 'utf8'), /\n {4}"/, 'o recuo do arquivo é mantido')
  const backups = readdirSync(join(HOME, '.claude')).filter((name) => name.includes('backup-wisp'))
  assert.equal(backups.length, 1)
  assert.deepEqual(JSON.parse(readFileSync(join(HOME, '.claude', backups[0]), 'utf8')), mine)
  assert.deepEqual(hooksStatus(), {
    installed: true,
    outdated: false,
    settingsPath: '~/.claude/settings.json'
  })
  assert.equal(preview('install').changes, false, 'instalar de novo não muda nada')
})

test('o arquivo mudou depois da prévia: não grava', () => {
  const stale = preview('uninstall')
  const text = readFileSync(SETTINGS, 'utf8')
  writeFileSync(SETTINGS, text.replace('"opus"', '"sonnet"'))
  const result = applyHooks('uninstall', stale.fingerprint)
  assert.ok('error' in result && /mudou desde a prévia/.test(result.error))
  assert.match(readFileSync(SETTINGS, 'utf8'), /"sonnet"/)
})

test('desinstalar tira só as entradas do Wisp', () => {
  const result = applyHooks('uninstall', preview('uninstall').fingerprint)
  assert.ok('ok' in result)
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  assert.deepEqual(settings.hooks, {
    Stop: [{ hooks: [{ type: 'command', command: 'notify-send pronto' }] }]
  })
  assert.equal(settings.model, 'sonnet')
})

test('JSON quebrado ou "hooks" estranho: o Wisp não mexe', () => {
  writeFileSync(SETTINGS, '{ "hooks": ')
  assert.match(String((previewHooks('install') as { error: string }).error), /não é um JSON válido/)
  assert.match(hooksStatus().problem ?? '', /não é um JSON válido/)
  writeFileSync(SETTINGS, JSON.stringify({ hooks: { PreToolUse: 'x' } }))
  assert.match(
    String((previewHooks('install') as { error: string }).error),
    /não tem o formato esperado/
  )
})

// ---- O relay -----------------------------------------------------------------------------
const RUNTIME = join(HOME, 'run')
mkdirSync(RUNTIME, { recursive: true, mode: 0o700 })
process.env.XDG_RUNTIME_DIR = RUNTIME

/** Roda o relay como o Claude Code roda: o evento no argumento, o JSON do hook no stdin. */
function relay(
  event: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {}
): Promise<{ code: number | null; stdout: string; ms: number }> {
  const start = Date.now()
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RELAY, event], {
      env: {
        PATH: process.env.PATH ?? '',
        HOME,
        XDG_RUNTIME_DIR: RUNTIME,
        TERM_PROGRAM: 'kitty',
        ...env
      },
      stdio: ['pipe', 'pipe', 'ignore']
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.on('close', (code) => resolve({ code, stdout, ms: Date.now() - start }))
    child.stdin.end(
      JSON.stringify({
        session_id: 'sessao-1',
        transcript_path: '/tmp/t.jsonl',
        cwd: '/tmp/projeto',
        hook_event_name: event,
        ...input
      })
    )
  })
}

test('sem o Wisp aberto: o relay sai na hora, sem decidir nada', async () => {
  const result = await relay('PermissionRequest', {
    tool_name: 'Bash',
    tool_input: { command: 'ls' }
  })
  assert.equal(result.code, 0)
  assert.equal(result.stdout, '')
  assert.ok(result.ms < 3000, `${result.ms} ms`)
})

let server: HookServer | null = null
after(() => server?.close())
/** O que chegou ao servidor do app. */
const events: RelayEvent[] = []

test('com o Wisp aberto: os eventos chegam, e o pedido de permissão espera a decisão', async () => {
  let pending: PendingReply | null = null
  const started = await startHookServer((event, reply) => {
    events.push(event)
    if (reply) pending = reply
  })
  assert.ok(started.ok, JSON.stringify(started))
  server = started.server
  const start = await relay('SessionStart', { source: 'startup' })
  assert.equal(start.code, 0)
  assert.equal(start.stdout, '')
  const event = events.find((item) => item.event === 'SessionStart')
  assert.ok(event)
  assert.equal(event.input.session_id, 'sessao-1')
  assert.deepEqual(event.env, { TERM_PROGRAM: 'kitty' })

  const asking = relay('PermissionRequest', {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf build' }
  })
  const deadline = Date.now() + 5000
  while (!pending && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(pending, 'o pedido chegou')
  pending!.reply({ decision: 'deny', message: 'Usuário negou' })
  const answer = await asking
  assert.deepEqual(JSON.parse(answer.stdout), {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'Usuário negou' }
    }
  })
})

test('processos do próprio Wisp: o relay não repassa nada', async () => {
  const before = events.length
  const result = await relay('SessionStart', { source: 'startup' }, { WISP_INTERNAL: '1' })
  assert.equal(result.code, 0)
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(events.length, before)
})

test('o script do relay: aponta para o app e não faz nada se ele sumir', () => {
  deployRelay('/opt/Wisp/wisp', '/opt/Wisp/resources/app/out/main/wisp-hook.js')
  const script = readFileSync(WRAPPER_PATH, 'utf8')
  assert.match(script, /electron='\/opt\/Wisp\/wisp'/)
  assert.match(script, /\[ -x "\$electron" \] && \[ -f "\$relay" \] \|\| exit 0/)
  assert.match(script, /ELECTRON_RUN_AS_NODE=1 exec "\$electron" "\$relay" "\$@"/)
})

// ---- O modo terminal de uma aba (Fase 17) -------------------------------------------------
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

/** O relay como o Claude Code do modo terminal o roda: `--tab <ficha> <Evento>` ou `--status`. */
function tabRelay(
  argv: string[],
  input: Record<string, unknown>
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RELAY, ...argv], {
      // Os processos do Wisp levam a marca: os hooks do modo terminal passam mesmo assim.
      env: { PATH: process.env.PATH ?? '', HOME, XDG_RUNTIME_DIR: RUNTIME, WISP_INTERNAL: '1' },
      stdio: ['pipe', 'pipe', 'ignore']
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.on('close', (code) => resolve({ code, stdout }))
    child.stdin.end(JSON.stringify(input))
  })
}

test('modo terminal: os eventos levam a ficha da aba, e a linha de status sai na hora', async () => {
  const before = events.length
  await tabRelay(['--tab', TOKEN, 'UserPromptSubmit'], {
    hook_event_name: 'UserPromptSubmit',
    session_id: 's1',
    prompt: 'oi'
  })
  const prompt = events.slice(before).find((event) => event.event === 'UserPromptSubmit')
  assert.equal(prompt?.tab, TOKEN)
  assert.equal(prompt?.input.prompt, 'oi')

  const status = await tabRelay(['--status', TOKEN], {
    session_id: 's1',
    model: { id: 'claude-opus-5-5', display_name: 'Opus' },
    context_window: { used_percentage: 41.6, context_window_size: 200000 },
    cost: { total_cost_usd: 1.5 }
  })
  assert.equal(status.stdout, 'Wisp · Opus · contexto 42%')
  const line = events.slice(before).find((event) => event.event === 'StatusLine')
  assert.equal(line?.tab, TOKEN)

  // Uma ficha que não tem a cara de uma: nada sai, nada chega.
  const count = events.length
  const bad = await tabRelay(['--tab', 'nao-e-ficha', 'Stop'], { hook_event_name: 'Stop' })
  assert.equal(bad.code, 0)
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(events.length, count)
})

test('modo terminal: aprovar o plano e mudar o modo vai junto na decisão', async () => {
  let pending: PendingReply | null = null
  const previous = server
  previous?.close()
  const started = await startHookServer((_event, reply) => {
    if (reply) pending = reply
  })
  assert.ok(started.ok)
  server = started.server
  const asking = tabRelay(['--tab', TOKEN, 'PermissionRequest'], {
    hook_event_name: 'PermissionRequest',
    tool_name: 'ExitPlanMode',
    tool_input: { plan: '# Plano' }
  })
  const deadline = Date.now() + 5000
  while (!pending && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(pending)
  pending!.reply({
    decision: 'allow',
    permissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
  })
  const answer = await asking
  assert.deepEqual(JSON.parse(answer.stdout).hookSpecificOutput.decision, {
    behavior: 'allow',
    updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
  })
})

test('modo terminal: respondido no terminal, o relay órfão sai sozinho', async () => {
  let closed = false
  server?.close()
  const started = await startHookServer((_event, reply) => {
    reply?.onClose(() => (closed = true))
  })
  assert.ok(started.ok)
  server = started.server
  // Um shell no meio, como o Claude Code roda os hooks; ele morre, e o relay fica sem pai.
  const shell = spawn(
    'sh',
    // O "; true" impede o shell de virar o relay (exec): ele fica no meio, como pai.
    ['-c', `"${process.execPath}" "${RELAY}" --tab ${TOKEN} PermissionRequest; true`],
    {
      env: { PATH: process.env.PATH ?? '', HOME, XDG_RUNTIME_DIR: RUNTIME },
      stdio: ['pipe', 'ignore', 'ignore']
    }
  )
  shell.stdin.end(
    JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: {} })
  )
  await new Promise((resolve) => setTimeout(resolve, 600))
  shell.kill('SIGKILL')
  const deadline = Date.now() + 5000
  while (!closed && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.ok(closed, 'o pedido foi embora junto com o terminal')
})

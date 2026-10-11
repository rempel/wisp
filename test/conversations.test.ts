// O "Permitir sempre" (programa, subcomando, comando exato), o que o Aceitar edições libera, o
// humor do mascote com várias conversas e os pedidos de permissão de uma Conversation em cada modo.
import './helpers/home'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as S from '../src/main/permission-scope'
import * as M from '../src/main/mood'
import * as C from '../src/main/conversation'

// ---- bashScope -------------------------------------------------------------
test('bashScope: program scope for simple commands', () => {
  assert.deepStrictEqual(S.bashScope('ls'), { key: 'Bash:ls', label: 'ls' })
  assert.deepStrictEqual(S.bashScope('ls -la src'), { key: 'Bash:ls', label: 'ls' })
  assert.deepStrictEqual(S.bashScope('  cat README.md  '), { key: 'Bash:cat', label: 'cat' })
  assert.strictEqual(S.bashScope('grep -rn foo .').key, 'Bash:grep')
})
test('bashScope: subcommand scope for git, npm…', () => {
  assert.deepStrictEqual(S.bashScope('git status'), { key: 'Bash:git status', label: 'git status' })
  assert.strictEqual(S.bashScope('git status --short').key, 'Bash:git status')
  assert.notStrictEqual(S.bashScope('git push').key, S.bashScope('git status').key)
  assert.strictEqual(S.bashScope('npm test').key, 'Bash:npm test')
  assert.strictEqual(S.bashScope('npm run lint').key, 'Bash:npm run')
  assert.strictEqual(S.bashScope('git').key, 'Bash:git')
  // An option before the subcommand changes what it does: exact.
  assert.deepStrictEqual(S.bashScope('git -C /etc status'), {
    key: 'Bash:git -C /etc status',
    label: 'git -C /etc status',
    exact: true
  })
})
test('bashScope: compound, redirections and substitutions are exact', () => {
  for (const cmd of [
    'ls; rm -rf ~',
    'ls && whoami',
    'ls | sh',
    'echo x > f',
    'cat < f',
    'echo $(id)',
    'echo `id`',
    'ls\nrm x',
    'sleep 1 &'
  ]) {
    const scope = S.bashScope(cmd)
    assert.strictEqual(scope.exact, true, cmd)
    assert.strictEqual(scope.key, `Bash:${cmd.trim()}`, cmd)
  }
})
test('bashScope: dangerous programs are exact', () => {
  for (const cmd of [
    'rm -rf build',
    'sudo apt install x',
    'curl https://x',
    'bash -c "ls"',
    'python3 x.py',
    'node -e 1',
    'npx foo',
    'find . -delete',
    'mv a b',
    'sed -i s/a/b/ f',
    'env X=1 ls',
    'xargs rm'
  ]) {
    assert.strictEqual(S.bashScope(cmd).exact, true, cmd)
  }
})
test('bashScope: paths, variables and quotes as program are exact', () => {
  for (const cmd of ['./build.sh', '/usr/bin/ls', 'X=1 ls', '"ls" -la', "'git' status"])
    assert.strictEqual(S.bashScope(cmd).exact, true, cmd)
})
test('bashScope: secrets are always exact', () => {
  for (const cmd of [
    'cat ~/.ssh/id_ed25519',
    'cat .env',
    'ls ~/.aws',
    'grep token ~/.config/gh/hosts.yml',
    'cat /home/u/.env.local',
    'head id_rsa',
    'cat ~/.claude/.credentials.json'
  ]) {
    assert.strictEqual(S.bashScope(cmd).exact, true, cmd)
  }
  // .envrc and "environment" aren't .env files.
  assert.strictEqual(S.bashScope('cat .envrc').exact, undefined)
  assert.strictEqual(S.bashScope('cat environment.md').exact, undefined)
})
test('bashScope: empty command is exact', () => assert.strictEqual(S.bashScope('  ').exact, true))
test('permissionScope: other tools are the tool name', () => {
  assert.deepStrictEqual(S.permissionScope('Write', { file_path: '/x' }), { key: 'Write' })
  assert.deepStrictEqual(S.permissionScope('mcp__desktop__open_app', { name: 'x' }), {
    key: 'mcp__desktop__open_app'
  })
  assert.deepStrictEqual(S.permissionScope('Bash', { command: 'git log' }), {
    key: 'Bash:git log',
    label: 'git log'
  })
  assert.deepStrictEqual(S.permissionScope('Bash', null), { key: 'Bash' })
})

// ---- editAllowed -----------------------------------------------------------
const HOME = '/home/ana'
test('editAllowed: files in home and roots, not hidden', () => {
  assert.strictEqual(S.editAllowed('/home/ana/projetos/app/src/a.ts', [], [], HOME), true)
  assert.strictEqual(S.editAllowed('/home/ana/notas.md', [], [], HOME), true)
  assert.strictEqual(S.editAllowed('/srv/code/x.ts', ['/srv/code'], [], HOME), true)
  assert.strictEqual(S.editAllowed('/etc/hosts', [], [], HOME), false)
  assert.strictEqual(S.editAllowed('/srv/other/x.ts', ['/srv/code'], [], HOME), false)
  assert.strictEqual(S.editAllowed('relative/x.ts', [], [], HOME), false)
  assert.strictEqual(S.editAllowed('/home/ana', [], [], HOME), false)
})
test('editAllowed: hidden files and folders keep asking', () => {
  for (const p of [
    '/home/ana/.bashrc',
    '/home/ana/.config/wisp/config.json',
    '/home/ana/proj/.git/config',
    '/home/ana/proj/.env',
    '/home/ana/.ssh/authorized_keys',
    '/home/ana/proj/.github/workflows/ci.yml',
    '/home/ana/proj/../.profile'
  ]) {
    assert.strictEqual(S.editAllowed(p, [], [], HOME), false, p)
  }
  // Secrets even inside a root.
  assert.strictEqual(S.editAllowed('/srv/code/id_rsa', ['/srv/code'], [], HOME), false)
})
test('editAllowed: trusted dirs even if hidden', () => {
  const ws = '/home/ana/.local/share/wisp/workspace'
  assert.strictEqual(S.editAllowed(`${ws}/plano.md`, [], [ws], HOME), true)
  assert.strictEqual(S.editAllowed(`${ws}/../config.json`, [], [ws], HOME), false)
})

// ---- mood ------------------------------------------------------------------
function mood() {
  const states = []
  const m = new M.MascotMood({ state: (s) => states.push(s), pulse: () => {} })
  return { m, states }
}
test('mood: any busy conversation keeps it working', () => {
  const { m } = mood()
  m.onEvent({ type: 'busy', busy: true }, 'a')
  m.onEvent({ type: 'busy', busy: true }, 'b')
  assert.strictEqual(m.state, 'working')
  m.onEvent({ type: 'busy', busy: false }, 'a')
  assert.strictEqual(m.state, 'working')
  m.onEvent({ type: 'busy', busy: false }, 'b')
  assert.strictEqual(m.state, 'idle')
  m.dispose()
})
test('mood: a card in any conversation is permission; turn-end clears only its own', () => {
  const { m } = mood()
  m.onEvent({ type: 'busy', busy: true }, 'a')
  m.onEvent({ type: 'busy', busy: true }, 'b')
  m.onEvent({ type: 'permission-request', id: 'r1', toolName: 'Bash', input: {} }, 'a')
  m.onEvent({ type: 'permission-request', id: 'r2', toolName: 'Bash', input: {} }, 'b')
  assert.strictEqual(m.state, 'permission')
  m.onEvent({ type: 'turn-end', outcome: 'stopped' }, 'a')
  assert.strictEqual(m.state, 'permission')
  m.onEvent({ type: 'permission-resolved', id: 'r2', decision: 'allow' }, 'b')
  assert.strictEqual(m.state, 'working')
  m.dispose()
})
test('mood: forget a closed conversation', () => {
  const { m } = mood()
  m.onEvent({ type: 'busy', busy: true }, 'a')
  m.onEvent({ type: 'permission-request', id: 'r1', toolName: 'Bash', input: {} }, 'a')
  assert.strictEqual(m.quiet, false)
  m.forget('a')
  assert.strictEqual(m.state, 'idle')
  assert.strictEqual(m.quiet, true)
  m.dispose()
})
test('mood: reset of one conversation keeps the other busy', () => {
  const { m } = mood()
  m.onEvent({ type: 'busy', busy: true }, 'a')
  m.onEvent({ type: 'busy', busy: true }, 'b')
  m.onEvent({ type: 'reset' }, 'a')
  assert.strictEqual(m.state, 'working')
  m.dispose()
})

// ---- Conversation ----------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-tabs-test-'))
function conversation(mode = 'default', extra = {}) {
  const events = [],
    attention = [],
    changed = []
  const host = {
    emit: (c, e) => events.push(e),
    attention: (c) => attention.push(c.id),
    changed: (c) => changed.push(c.title)
  }
  const conv = new C.Conversation({
    id: 'c1',
    host,
    claude: {
      claudePath: '/bin/false',
      workspace: () => tmp,
      allowedTools: [],
      appendSystemPrompt: ''
    },
    modeFile: path.join(tmp, `mode-${Math.random()}`),
    permissionMode: mode,
    provider: 'subscription',
    modelFor: () => null,
    projectRoots: () => extra.roots ?? [],
    trustedDirs: extra.trusted ?? []
  })
  return { conv, events, attention, changed }
}
const lastOf = (events, type) => [...events].reverse().find((e) => e.type === type)
const request = (toolName, input) => ({ toolName, input, toolUseId: 'tu' })

test('conversation: card, allow, deny', async () => {
  const { conv, events, attention } = conversation()
  const p = conv.requestApproval(request('Bash', { command: 'ls src' }))
  const card = lastOf(events, 'permission-request')
  assert.strictEqual(card.scope, 'ls')
  assert.strictEqual(card.exact, undefined)
  assert.deepStrictEqual(attention, ['c1'])
  assert.strictEqual(conv.pendingCount(), 1)
  assert.ok(conv.owns(card.id))
  assert.strictEqual(conv.answer(card.id, 'allow'), true)
  assert.deepStrictEqual(await p, { allow: true })
  const p2 = conv.requestApproval(request('Bash', { command: 'ls src' }))
  conv.answer(lastOf(events, 'permission-request').id, 'deny')
  assert.deepStrictEqual(await p2, { allow: false, message: 'Usuário negou' })
  conv.dispose()
})
test('conversation: "sempre" for a program covers other arguments, not other programs', async () => {
  const { conv, events } = conversation()
  const p = conv.requestApproval(request('Bash', { command: 'ls' }))
  conv.answer(lastOf(events, 'permission-request').id, 'allow-always')
  await p
  const before = events.length
  assert.deepStrictEqual(await conv.requestApproval(request('Bash', { command: 'ls -la src' })), {
    allow: true
  })
  assert.strictEqual(events.length, before)
  // Another program, and compound commands starting with ls, still ask.
  void conv.requestApproval(request('Bash', { command: 'ls; rm -rf x' }))
  const card = lastOf(events, 'permission-request')
  assert.strictEqual(card.exact, true)
  assert.strictEqual(card.scope, 'ls; rm -rf x')
  conv.dispose()
})
test('conversation: "sempre" for git status does not cover git push', async () => {
  const { conv, events } = conversation()
  const p = conv.requestApproval(request('Bash', { command: 'git status' }))
  conv.answer(lastOf(events, 'permission-request').id, 'allow-always')
  await p
  assert.deepStrictEqual(
    await conv.requestApproval(request('Bash', { command: 'git status -s' })),
    { allow: true }
  )
  void conv.requestApproval(request('Bash', { command: 'git push' }))
  assert.strictEqual(lastOf(events, 'permission-request').scope, 'git push')
  conv.dispose()
})
test('conversation: reset forgets "sempre"', async () => {
  const { conv, events } = conversation()
  const p = conv.requestApproval(request('Write', { file_path: '/tmp/x' }))
  conv.answer(lastOf(events, 'permission-request').id, 'allow-always')
  await p
  assert.deepStrictEqual(await conv.requestApproval(request('Write', { file_path: '/tmp/y' })), {
    allow: true
  })
  conv.deliver({ type: 'reset' })
  void conv.requestApproval(request('Write', { file_path: '/tmp/y' }))
  assert.strictEqual(lastOf(events, 'permission-request').toolName, 'Write')
  conv.dispose()
})
test('conversation: Aceitar edições lets home edits through, hidden ones ask', async () => {
  const home = os.homedir()
  const { conv, events } = conversation('acceptEdits')
  assert.deepStrictEqual(
    await conv.requestApproval(request('Edit', { file_path: path.join(home, 'proj/a.ts') })),
    { allow: true }
  )
  assert.deepStrictEqual(
    await conv.requestApproval(request('Write', { file_path: path.join(home, 'notas.md') })),
    { allow: true }
  )
  void conv.requestApproval(request('Write', { file_path: path.join(home, '.bashrc') }))
  assert.strictEqual(lastOf(events, 'permission-request').toolName, 'Write')
  void conv.requestApproval(request('Bash', { command: 'ls' }))
  assert.strictEqual(lastOf(events, 'permission-request').toolName, 'Bash')
  conv.dispose()
})
test('conversation: Pedir mode asks for edits in home', () => {
  const { conv, events } = conversation('default')
  void conv.requestApproval(request('Edit', { file_path: path.join(os.homedir(), 'proj/a.ts') }))
  assert.strictEqual(lastOf(events, 'permission-request').toolName, 'Edit')
  conv.dispose()
})
test('conversation: setMode changes the mode, emits it and writes the mode file', () => {
  const { conv, events } = conversation('default')
  conv.setMode('auto')
  assert.strictEqual(conv.mode, 'auto')
  assert.deepStrictEqual(lastOf(events, 'mode'), { type: 'mode', mode: 'auto' })
  assert.strictEqual(
    fs.readFileSync(conv.session.options?.modeFile ?? conv['options'].modeFile, 'utf8'),
    'auto'
  )
  assert.deepStrictEqual(
    conv.initialEvents().find((e) => e.type === 'mode'),
    { type: 'mode', mode: 'auto' }
  )
  conv.dispose()
})
test('conversation: plan card has its own buttons', async () => {
  const { conv, events } = conversation('plan')
  const input = { plan: '# Plano\n1. Fazer', planFilePath: '/tmp/p.md' }
  let p = conv.requestApproval(request('ExitPlanMode', input))
  let card = lastOf(events, 'permission-request')
  assert.strictEqual(card.always, 'none')
  assert.strictEqual(conv.answer(card.id, 'allow-always'), false)
  assert.strictEqual(conv.answer(card.id, 'allow-edits'), true)
  assert.deepStrictEqual(await p, {
    allow: true,
    updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
  })
  p = conv.requestApproval(request('ExitPlanMode', input))
  conv.answer(lastOf(events, 'permission-request').id, 'allow-auto')
  assert.deepStrictEqual((await p).updatedPermissions[0].mode, 'auto')
  p = conv.requestApproval(request('ExitPlanMode', input))
  conv.answer(lastOf(events, 'permission-request').id, 'allow')
  assert.deepStrictEqual(await p, { allow: true })
  p = conv.requestApproval(request('ExitPlanMode', input))
  conv.answer(lastOf(events, 'permission-request').id, 'deny')
  const denied = await p
  assert.strictEqual(denied.allow, false)
  assert.match(denied.message, /continuar planejando/)
  // Plan buttons don't apply to other cards.
  void conv.requestApproval(request('Bash', { command: 'ls' }))
  card = lastOf(events, 'permission-request')
  assert.strictEqual(conv.answer(card.id, 'allow-auto'), false)
  assert.strictEqual(conv.answer(card.id, 'allow-edits'), false)
  assert.ok(conv.owns(card.id))
  conv.dispose()
})
test('conversation: turn-end cancels open cards; aborted signal removes the card', async () => {
  const { conv, events } = conversation()
  const p = conv.requestApproval(request('Bash', { command: 'ls' }))
  conv.deliver({ type: 'turn-end', outcome: 'stopped' })
  assert.strictEqual((await p).allow, false)
  assert.strictEqual(lastOf(events, 'permission-resolved').decision, 'cancelled')
  const ctl = new AbortController()
  const p2 = conv.requestApproval({ ...request('Bash', { command: 'pwd' }), signal: ctl.signal })
  ctl.abort()
  assert.deepStrictEqual(await p2, { allow: false, message: 'O pedido foi cancelado.' })
  assert.strictEqual(conv.pendingCount(), 0)
  conv.dispose()
})
test('conversation: first message titles the tab', () => {
  const { conv, changed } = conversation()
  conv.session.send = async () => {}
  assert.strictEqual(
    conv.send('Qual a previsão do tempo amanhã?', [], (f) => f),
    true
  )
  assert.strictEqual(conv.title, 'Qual a previsão do tempo amanhã?')
  assert.deepStrictEqual(changed, [conv.title])
  conv.dispose()
})
test('conversation: disposed ignores events', () => {
  const { conv, events } = conversation()
  conv.dispose()
  const n = events.length
  conv.deliver({ type: 'text', blockId: 'a', delta: 'x' })
  assert.strictEqual(events.length, n)
})

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))

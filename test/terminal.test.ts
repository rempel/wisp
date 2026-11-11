// O modo terminal (Fase 17): a linha de status, as configurações do processo (os hooks da aba e
// o hook do Bash), a pasta da OpenRouter sem as boas-vindas, o menu dos comandos com barra, as
// teclas que continuam do Wisp e o pseudo-terminal de verdade (node-pty).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { terminalSettings } from '../src/main/claude'
import { HOOK_EVENTS } from '../src/main/hooks/protocol'
import { readStatus, statusLine } from '../src/main/hooks/status-line'
import { seedTerminalConfig } from '../src/main/openrouter'
import { TerminalProcess } from '../src/main/tui'
import { matchCommands, slashQuery } from '../src/renderer/chat/slash'
import { isWispTerminalShortcut } from '../src/renderer/chat/terminal-keys'

const STATUS = {
  session_id: 's',
  model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet' },
  context_window: {
    total_input_tokens: 52000,
    total_output_tokens: 900,
    context_window_size: 200000,
    current_usage: {
      input_tokens: 1000,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 30000,
      output_tokens: 200
    },
    used_percentage: 15.8
  },
  cost: { total_cost_usd: 0.42 }
}

test('a linha de status: o modelo e o contexto, sem o custo (que seria pelos preços errados)', () => {
  assert.deepEqual(readStatus(STATUS), {
    model: 'claude-sonnet-5-5',
    used: 31700,
    window: 200000,
    percent: 15.8,
    inputTokens: 52000,
    outputTokens: 900
  })
  assert.equal(statusLine(STATUS), 'Wisp · Sonnet · contexto 16%')
  // Antes da primeira resposta, sem o contexto; um JSON estranho não quebra nada.
  assert.equal(statusLine({ model: { id: 'x' } }), 'Wisp · x')
  assert.equal(statusLine('lixo'), 'Wisp')
  assert.deepEqual(readStatus(null), {
    model: null,
    used: null,
    window: null,
    percent: null,
    inputTokens: null,
    outputTokens: null
  })
})

test('as configurações do terminal: os hooks da aba, o hook do Bash e a linha de status', () => {
  const token = 'abcdef0123456789abcdef0123456789'
  const settings = JSON.parse(terminalSettings(token, '/opt/Wisp dir/wisp-hook'))
  for (const { event, timeout, async } of HOOK_EVENTS) {
    const entries = settings.hooks[event] as { hooks: Record<string, unknown>[] }[]
    const ours = entries.at(-1)!.hooks[0]
    assert.equal(ours.command, `'/opt/Wisp dir/wisp-hook' --tab ${token} ${event}`)
    assert.equal(ours.timeout, timeout)
    assert.equal(ours.async === true, async && event !== 'UserPromptSubmit')
  }
  // O hook que manda todo Bash para a aprovação continua, antes do da aba.
  const bash = settings.hooks.PreToolUse[0]
  assert.equal(bash.matcher, 'Bash')
  assert.match(bash.hooks[0].command, /WISP_PERMISSION_MODE_FILE/)
  assert.equal(settings.statusLine.command, `'/opt/Wisp dir/wisp-hook' --status ${token}`)
  assert.ok(settings.permissions.ask.some((rule: string) => rule.startsWith('Read(~/.ssh')))
})

test('a pasta da OpenRouter começa sem as boas-vindas, e a pasta da conversa, confiável', () => {
  const dir = join(HOME, 'or-config')
  seedTerminalConfig('/home/u/projeto', dir)
  const first = JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8'))
  assert.equal(first.hasCompletedOnboarding, true)
  assert.equal(first.theme, 'dark')
  assert.equal(first.projects['/home/u/projeto'].hasTrustDialogAccepted, true)
  // O que já havia fica; outra pasta entra junto.
  writeFileSync(
    join(dir, '.claude.json'),
    JSON.stringify({ ...first, theme: 'light', userID: 'x' })
  )
  seedTerminalConfig('/home/u/outro', dir)
  const second = JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8'))
  assert.equal(second.theme, 'light')
  assert.equal(second.userID, 'x')
  assert.equal(second.projects['/home/u/projeto'].hasTrustDialogAccepted, true)
  assert.equal(second.projects['/home/u/outro'].hasTrustDialogAccepted, true)
  // Um arquivo estragado fica como está.
  writeFileSync(join(dir, '.claude.json'), '{ estragado')
  seedTerminalConfig('/home/u/terceiro', dir)
  assert.equal(readFileSync(join(dir, '.claude.json'), 'utf8'), '{ estragado')
})

test('o menu dos comandos com barra', () => {
  assert.equal(slashQuery('/'), '')
  assert.equal(slashQuery('/rev'), 'rev')
  assert.equal(slashQuery('/revisa '), null, 'com argumentos, o menu fecha')
  assert.equal(slashQuery('oi /rev'), null)
  const cli = ['compact', 'revisa', 'review', 'deploy-rapido', 'preview']
  assert.deepEqual(
    matchCommands('', cli).map((c) => c.name),
    ['compact', 'clear', 'pr', 'revisa', 'review', 'deploy-rapido', 'preview']
  )
  // Primeiro os que começam assim, depois os que contêm.
  assert.deepEqual(
    matchCommands('rev', cli).map((c) => c.name),
    ['revisa', 'review', 'preview']
  )
  assert.match(matchCommands('comp', cli)[0].description, /Compactar/)
})

test('no terminal, só os atalhos das abas e da grade continuam do Wisp', () => {
  const press = (key: string, mods: Partial<Record<'ctrl' | 'shift' | 'alt', boolean>> = {}) =>
    isWispTerminalShortcut({
      key,
      code: key === '\\' ? 'Backslash' : `Key${key.toUpperCase()}`,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      metaKey: false
    })
  assert.equal(press('t', { ctrl: true }), true)
  assert.equal(press('3', { ctrl: true }), true)
  assert.equal(press('Tab', { ctrl: true }), true)
  assert.equal(press('\\', { ctrl: true }), true)
  assert.equal(press('ArrowLeft', { alt: true, shift: true }), true)
  // Do Claude Code: o Esc, o Ctrl+K, o Ctrl+W, o Ctrl+M (Enter), o Ctrl+C.
  assert.equal(press('Escape'), false)
  assert.equal(press('k', { ctrl: true }), false)
  assert.equal(press('w', { ctrl: true }), false)
  assert.equal(press('m', { ctrl: true }), false)
  assert.equal(press('c', { ctrl: true }), false)
})

test('o pseudo-terminal: o tamanho, a colagem, a tela guardada e o fim', async () => {
  const dir = join(HOME, 'pty')
  mkdirSync(dir, { recursive: true })
  let output = ''
  let exited: number | null | undefined
  const terminal = new TerminalProcess(
    {
      data: (chunk) => (output += chunk),
      exit: (code) => (exited = code)
    },
    90,
    20
  )
  assert.match(terminal.token, /^[a-f0-9]{32}$/)
  // Um "Claude Code" que mostra o tamanho e devolve o que recebe.
  terminal.start({
    file: '/bin/sh',
    args: ['-c', 'stty size; stty -echo; read line; echo "recebi: $line"'],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TERM: 'xterm-256color' },
    cwd: dir
  })
  const wait = async (re: RegExp): Promise<void> => {
    const deadline = Date.now() + 5000
    while (!re.test(output) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    assert.match(output, re)
  }
  await wait(/20 90/)
  // As marcas de colagem dentro do texto não fecham a colagem antes da hora.
  terminal.paste('oi \x1b[201~mundo', true)
  await wait(/recebi: .*oi mundo/)
  const deadline = Date.now() + 5000
  while (exited === undefined && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
  assert.equal(exited, 0)
  assert.equal(terminal.running, false)
  assert.match(terminal.snapshot(), /recebi/)

  // Colado logo depois de subir: espera o programa mostrar algo (e mais um instante), porque o que
  // chegasse antes se perderia (este joga fora o que chegou antes do "pronto", como um programa que
  // ainda não ligou o modo cru do terminal).
  let early = ''
  const fresh = new TerminalProcess({ data: (chunk) => (early += chunk), exit: () => {} })
  fresh.start({
    file: '/bin/bash',
    args: [
      '-c',
      'stty -echo; sleep 0.5; while read -t 0.05 junk; do :; done; echo pronto; read line; echo "recebi: $line"'
    ],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TERM: 'xterm-256color' },
    cwd: dir
  })
  fresh.paste('cedo demais', true)
  const until = Date.now() + 5000
  while (!/recebi:/.test(early) && Date.now() < until) await new Promise((r) => setTimeout(r, 20))
  assert.match(early, /pronto[\s\S]*recebi: .*cedo demais/)
  await fresh.kill()

  // Encerrar um que não sai sozinho.
  const stuck = new TerminalProcess({ data: () => {}, exit: () => {} })
  stuck.start({
    file: '/bin/sh',
    args: ['-c', 'sleep 30'],
    env: { PATH: '/usr/bin:/bin' },
    cwd: dir
  })
  assert.equal(stuck.running, true)
  await stuck.kill()
  assert.equal(stuck.running, false)
})

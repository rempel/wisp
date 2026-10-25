// Os servidores MCP pelo Wisp (Fase 30): ler os seus (do ~/.claude.json) e os dos projetos, sem
// mostrar segredo; os que entram nas conversas do Wisp (só os ligados, nunca com o nome de um do
// Wisp); conferir o que vem da página; a prévia; gravar pelo `claude mcp` (o de mentira), com o
// backup antes; e as ferramentas que cada servidor ofereceu no começo de uma conversa.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { FIXTURES } from './helpers/paths'
import { runClaudeCli } from '../src/main/claude-cli'
import { startDesktopServer } from '../src/main/mcp-server'
import {
  applyMcp,
  CATALOG_FILE,
  checkChange,
  checkServerInput,
  claudeJsonPath,
  mcpSnapshot,
  previewMcp,
  recordMcpInit,
  wispServers
} from '../src/main/mcp-servers'
import type { McpChange } from '../src/shared/ipc'

const CLI = join(FIXTURES, 'fake-claude')
const FILE = join(HOME, '.claude.json')
const write = (servers: Record<string, unknown>): void =>
  writeFileSync(FILE, JSON.stringify({ numStartups: 7, mcpServers: servers }, null, 2))

const SERVERS = {
  notas: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@exemplo/notas', '--pasta', 'Meus Documentos'],
    env: { NOTAS_TOKEN: 'segredo-123' }
  },
  web: {
    type: 'http',
    url: 'https://mcp.exemplo.com/mcp',
    headers: { Authorization: 'Bearer x9' }
  },
  desktop: { type: 'stdio', command: 'outro-desktop' },
  estranho: { type: 'ws', url: 'ws://localhost:1' }
}

test('o arquivo: o ~/.claude.json, ou o do CLAUDE_CONFIG_DIR', () => {
  assert.equal(claudeJsonPath(), FILE)
  assert.equal(claudeJsonPath({ CLAUDE_CONFIG_DIR: '/etc/claude' }), '/etc/claude/.claude.json')
  assert.equal(claudeJsonPath({ CLAUDE_CONFIG_DIR: 'relativo' }), FILE)
})

test('a lista: os seus e os dos projetos, com os segredos só pelo nome', () => {
  write(SERVERS)
  const project = join(HOME, 'projetos/loja')
  mkdirSync(project, { recursive: true })
  writeFileSync(
    join(project, '.mcp.json'),
    JSON.stringify({ mcpServers: { banco: { command: 'pg-mcp', args: ['--ro'] } } })
  )
  const snapshot = mcpSnapshot(['notas', 'desktop'], [{ nome: 'loja', caminho: project }])
  assert.equal(snapshot.configPath, '~/.claude.json')
  assert.equal(snapshot.problem, undefined)
  const byName = Object.fromEntries(snapshot.servers.map((server) => [server.name, server]))
  assert.deepEqual(byName.notas, {
    name: 'notas',
    scope: 'user',
    kind: 'command',
    summary: 'npx -y @exemplo/notas --pasta "Meus Documentos"',
    secrets: ['NOTAS_TOKEN'],
    enabled: true
  })
  assert.equal(byName.web.kind, 'url')
  assert.equal(byName.web.summary, 'https://mcp.exemplo.com/mcp')
  assert.deepEqual(byName.web.secrets, ['Authorization'])
  assert.equal(byName.web.enabled, false)
  // Um com o nome de um do Wisp nunca entra; um formato desconhecido aparece, de fora.
  assert.equal(byName.desktop.reserved, true)
  assert.equal(byName.desktop.enabled, false)
  assert.equal(byName.estranho.kind, 'other')
  assert.deepEqual(
    { ...byName.banco },
    {
      name: 'banco',
      scope: 'project',
      project: 'loja',
      kind: 'command',
      summary: 'pg-mcp --ro',
      secrets: [],
      enabled: false
    }
  )
  // Nada de segredo no que vai para a página.
  assert.ok(!JSON.stringify(snapshot).includes('segredo-123'))
  assert.ok(!JSON.stringify(snapshot).includes('x9'))
  // Um arquivo estragado vira o aviso, sem quebrar a lista dos projetos.
  writeFileSync(FILE, '{ não é json')
  const broken = mcpSnapshot([], [{ nome: 'loja', caminho: project }])
  assert.ok(broken.problem)
  assert.deepEqual(
    broken.servers.map((server) => server.name),
    ['banco']
  )
})

test('nas conversas do Wisp: só os seus ligados, limpos, e nunca com o nome de um do Wisp', () => {
  write(SERVERS)
  assert.deepEqual(wispServers([]), {})
  assert.deepEqual(wispServers(['notas', 'web', 'desktop', 'estranho', 'sumiu']), {
    notas: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@exemplo/notas', '--pasta', 'Meus Documentos'],
      env: { NOTAS_TOKEN: 'segredo-123' }
    },
    web: {
      type: 'http',
      url: 'https://mcp.exemplo.com/mcp',
      headers: { Authorization: 'Bearer x9' }
    }
  })
})

test('o que vem da página é conferido', () => {
  const ok = checkServerInput({
    kind: 'command',
    name: 'notas',
    command: ' npx ',
    args: ['-y', 3, 'x'],
    env: { TOKEN: 'a', outro: 1 }
  })
  assert.deepEqual(ok, {
    kind: 'command',
    name: 'notas',
    command: 'npx',
    args: ['-y', 'x'],
    env: { TOKEN: 'a' }
  })
  assert.deepEqual(
    checkServerInput({ kind: 'url', name: 'web', url: 'https://a.b/mcp', headers: {} }),
    {
      kind: 'url',
      name: 'web',
      url: 'https://a.b/mcp',
      headers: {}
    }
  )
  for (const bad of [
    { kind: 'command', name: '-x', command: 'a', args: [], env: {} },
    { kind: 'command', name: 'a b', command: 'a', args: [], env: {} },
    { kind: 'command', name: 'desktop', command: 'a', args: [], env: {} },
    { kind: 'command', name: 'ok', command: '  ', args: [], env: {} },
    { kind: 'command', name: 'ok', command: 'a', args: [], env: { '1X': 'a' } },
    { kind: 'url', name: 'ok', url: 'file:///etc/passwd', headers: {} },
    { kind: 'url', name: 'ok', url: 'https://a.b', headers: { 'Bad Header': 'x' } },
    { kind: 'outro', name: 'ok' },
    null
  ]) {
    assert.equal(typeof checkServerInput(bad), 'string', JSON.stringify(bad))
  }
  assert.deepEqual(checkChange({ action: 'remove', name: 'notas' }), {
    action: 'remove',
    name: 'notas'
  })
  assert.equal(typeof checkChange({ action: 'remove', name: '../x' }), 'string')
  assert.equal(typeof checkChange({ action: 'apagar-tudo' }), 'string')
})

const ADD: McpChange = {
  action: 'add',
  server: {
    kind: 'command',
    name: 'agenda',
    command: 'agenda-mcp',
    args: ['--ro'],
    env: { CHAVE: 'k-777' }
  }
}

test('a prévia: o diff do mcpServers, sem os valores secretos, e o backup', () => {
  write(SERVERS)
  const preview = previewMcp(ADD)
  assert.ok(!('error' in preview))
  const text = preview.diff.flatMap((hunk) => hunk.lines).join('\n')
  assert.match(text, /^\+ {4}"agenda": \{$/m)
  assert.match(text, /^\+ {6}"command": "agenda-mcp",$/m)
  assert.ok(text.includes('•••'))
  assert.ok(!text.includes('k-777') && !text.includes('segredo-123'))
  assert.match(preview.backupPath ?? '', /^~\/\.claude\.json\.backup-wisp-\d{4}-\d{2}-\d{2}-\d{6}$/)
  // Já existe: não sobrescreve; tirar um que não existe: avisa.
  assert.ok('error' in previewMcp({ ...ADD, server: { ...ADD.server, name: 'notas' } }))
  assert.ok('error' in previewMcp({ action: 'remove', name: 'nenhum' }))
})

test('gravar pelo claude mcp: confere, faz o backup, grava e confere de novo', async () => {
  write(SERVERS)
  const original = readFileSync(FILE, 'utf8')
  const run = (args: string[]): ReturnType<typeof runClaudeCli> => runClaudeCli(CLI, args)
  const preview = previewMcp(ADD)
  assert.ok(!('error' in preview))
  const added = await applyMcp(ADD, preview.fingerprint, run)
  assert.ok(added.ok, JSON.stringify(added))
  const json = JSON.parse(readFileSync(FILE, 'utf8'))
  assert.deepEqual(json.mcpServers.agenda, {
    type: 'stdio',
    command: 'agenda-mcp',
    args: ['--ro'],
    env: { CHAVE: 'k-777' }
  })
  // O resto do arquivo fica (quem grava é o Claude Code).
  assert.equal(json.numStartups, 7)
  const backups = readdirSync(HOME).filter((name) => name.startsWith('.claude.json.backup-wisp-'))
  assert.equal(backups.length, 1)
  assert.equal(readFileSync(join(HOME, backups[0]), 'utf8'), original)
  const log = readFileSync(join(HOME, '.fake-claude/mcp.log'), 'utf8').trim().split('\n')
  assert.deepEqual(JSON.parse(log.at(-1)!).slice(0, 5), [
    'mcp',
    'add-json',
    '--scope',
    'user',
    'agenda'
  ])

  // A prévia velha não vale para um servidor que mudou depois dela.
  const removal = previewMcp({ action: 'remove', name: 'agenda' })
  assert.ok(!('error' in removal))
  write({ ...SERVERS, agenda: { type: 'stdio', command: 'outra-coisa' } })
  const stale = await applyMcp({ action: 'remove', name: 'agenda' }, removal.fingerprint, run)
  assert.ok(!stale.ok && /mudou desde a prévia/.test(stale.message))

  // O CLI recusa: a mensagem dele aparece, e nada muda.
  const fresh = previewMcp({ action: 'remove', name: 'agenda' })
  assert.ok(!('error' in fresh))
  const refused = await applyMcp(
    { action: 'remove', name: 'agenda' },
    fresh.fingerprint,
    async () => ({
      ok: false,
      output: 'linha 1\nError: sem permissão'
    })
  )
  assert.ok(!refused.ok && refused.message.endsWith('Error: sem permissão'))
  // O CLI diz que deu certo, mas o arquivo não mudou: não vale.
  const silent = await applyMcp(
    { action: 'remove', name: 'agenda' },
    fresh.fingerprint,
    async () => ({
      ok: true,
      output: ''
    })
  )
  assert.ok(!silent.ok)
  const removed = await applyMcp({ action: 'remove', name: 'agenda' }, fresh.fingerprint, run)
  assert.ok(removed.ok, JSON.stringify(removed))
  assert.equal(JSON.parse(readFileSync(FILE, 'utf8')).mcpServers.agenda, undefined)
})

test('as ferramentas de cada servidor, do começo da conversa (sem as do Wisp)', () => {
  recordMcpInit(
    [
      { name: 'desktop', status: 'connected' },
      { name: 'notas', status: 'connected' },
      { name: 'web', status: 'failed' }
    ],
    ['Bash', 'mcp__desktop__notify', 'mcp__notas__ler', 'mcp__notas__buscar', 'mcp__web__x']
  )
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
  assert.deepEqual(Object.keys(catalog).sort(), ['notas', 'web'])
  assert.deepEqual(catalog.notas.tools, ['buscar', 'ler'])
  assert.equal(catalog.web.status, 'failed')
  write(SERVERS)
  const notas = mcpSnapshot(['notas'], []).servers.find((server) => server.name === 'notas')
  assert.deepEqual(notas?.tools, ['buscar', 'ler'])
  assert.equal(notas?.status, 'connected')
  // Sem lista de servidores (um init antigo): nada muda.
  recordMcpInit(undefined, [])
  assert.ok(existsSync(CATALOG_FILE))
})

test('o --mcp-config de cada conversa leva os extras do momento, com o do Wisp por último', async () => {
  let extra: Record<string, unknown> = { notas: { type: 'stdio', command: 'npx' } }
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code'
  })
  try {
    server.setExtraServers(() => extra)
    const first = JSON.parse(readFileSync(server.configFor('c1'), 'utf8')).mcpServers
    assert.deepEqual(Object.keys(first), ['notas', 'desktop'])
    // Um "desktop" de fora nunca troca o do Wisp.
    extra = { desktop: { type: 'stdio', command: 'impostor' } }
    const second = JSON.parse(readFileSync(server.configFor('c2'), 'utf8')).mcpServers
    assert.equal(second.desktop.type, 'http')
  } finally {
    server.close()
  }
})

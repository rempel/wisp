// As skills que ele aprende (Fase 86): o SKILL.md proposto (o mesmo no card e no arquivo, com a
// marca do Wisp), gravar com o backup da de antes, recusar segredos, a propose_skill sempre com
// o card, e as sugestões da faxina da semana (a partir dos seus pedidos repetidos).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ALWAYS_ASK, SAFE_TOOLS } from '../src/main/claude-settings'
import { Distiller } from '../src/main/distill'
import { History } from '../src/main/history'
import { currentSkill, skillFile, writeSkill } from '../src/main/learned-skills'
import { cleanupAction } from '../src/main/memory'
import { recentRequests } from '../src/main/memory-setup'
import { startDesktopServer } from '../src/main/mcp-server'
import { PersonalMemory } from '../src/main/personal-memory'
import { isWispSkill, skillDraftOf, skillText } from '../src/shared/skill-text'

const draft = {
  name: 'resumo-prs',
  description: 'Resume os PRs abertos do usuário em tópicos',
  instructions: '1. Rode `gh pr list`.\n2. Resuma cada PR numa linha.'
}

test('skills: o SKILL.md proposto, com o cabeçalho e a marca do Wisp', () => {
  const text = skillText(draft)
  assert.match(
    text,
    /^---\nname: resumo-prs\ndescription: "Resume os PRs abertos do usuário em tópicos"\n---\n\n/
  )
  assert.ok(isWispSkill(text))
  assert.match(text, /1\. Rode `gh pr list`\.\n2\. Resuma cada PR numa linha\.\n$/)
  assert.deepEqual(skillDraftOf({ nome: 'resumo-prs', descricao: ' Resume ', instrucoes: ' x ' }), {
    name: 'resumo-prs',
    description: 'Resume',
    instructions: 'x'
  })
  for (const [input, problem] of [
    [{ nome: 'Resumo PRs', descricao: 'a', instrucoes: 'b' }, /minúsculas/],
    [{ nome: 'ok', descricao: '', instrucoes: 'b' }, /descrição/],
    [{ nome: 'ok', descricao: 'a', instrucoes: '' }, /instruções/],
    [{ nome: 'ok', descricao: 'a'.repeat(301), instrucoes: 'b' }, /300/]
  ] as const) {
    const result = skillDraftOf(input)
    assert.ok('error' in result && problem.test(result.error), JSON.stringify(input))
  }
})

test('skills: gravar cria a pasta; mudar guarda a de antes; segredos não entram', () => {
  const config = join(HOME, 'claude-skills')
  const first = writeSkill(draft, config)
  assert.ok(first.ok)
  assert.equal(first.path, skillFile('resumo-prs', config))
  assert.equal(currentSkill('resumo-prs', config), skillText(draft))
  const second = writeSkill({ ...draft, instructions: 'Agora com o CI de cada um.' }, config)
  assert.ok(second.ok && second.backup)
  assert.match(readFileSync(second.backup!, 'utf8'), /gh pr list/)
  assert.match(currentSkill('resumo-prs', config) ?? '', /Agora com o CI/)
  const secret = writeSkill(
    { ...draft, instructions: 'Use o token=ghp_0123456789abcdefghijABCDEFGHIJ' },
    config
  )
  assert.equal(secret.ok, false)
  assert.equal(currentSkill('nada', config), null)
})

test('skills: a propose_skill sempre pede o card e grava na pasta do Claude Code', async () => {
  assert.ok(ALWAYS_ASK.includes('mcp__desktop__propose_skill'))
  assert.ok(!SAFE_TOOLS.includes('mcp__desktop__propose_skill'))
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const config = join(HOME, 'claude-propose')
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    skills: { configDir: () => config }
  })
  try {
    const desktop = JSON.parse(readFileSync(server.configFor('c1'), 'utf8')).mcpServers.desktop
    const call = async (args: unknown) => {
      const res = await fetch(desktop.url, {
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
          params: { name: 'propose_skill', arguments: args }
        })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body).result as {
        isError?: boolean
        content: { text: string }[]
      }
    }
    const made = await call({
      nome: 'boletos',
      descricao: 'Os boletos do mês',
      instrucoes: 'Liste os boletos.'
    })
    assert.match(made.content[0].text, /Skill gravada em .*boletos\/SKILL\.md.*\/boletos/)
    assert.ok(existsSync(skillFile('boletos', config)))
    const bad = await call({ nome: 'X', descricao: 'a', instrucoes: 'b' })
    assert.equal(bad.isError, true)
  } finally {
    server.close()
  }
})

test('skills: a faxina sugere a partir dos pedidos repetidos, e a tela cria ou descarta', async () => {
  const root = join(HOME, 'sugestoes')
  const memory = new PersonalMemory(join(root, 'memoria'))
  const config = join(root, 'claude')
  mkdirSync(config, { recursive: true })
  writeSkill({ ...draft, name: 'ja-existe' }, config)
  const prompts: string[] = []
  const reply = JSON.stringify({
    skills: [
      {
        nome: 'resumo-prs',
        descricao: 'Resume os PRs abertos',
        instrucoes: '1. gh pr list',
        motivo: 'Pedido em 3 dias'
      },
      { nome: 'ja-existe', descricao: 'x', instrucoes: 'y', motivo: 'z' },
      { nome: 'Invalida', descricao: 'x', instrucoes: 'y' }
    ]
  })
  const ready: string[][] = []
  const distiller = new Distiller({
    memory,
    load: () => null,
    excluded: () => [],
    enabled: () => true,
    ask: async (prompt) => {
      prompts.push(prompt)
      return { ok: true, text: reply, cost: 0.001 }
    },
    file: join(root, 'memoria', 'destilacao.json'),
    recentRequests: () => [
      '2026-11-16: resume os PRs abertos do wisp em tópicos',
      '2026-11-17: resume os PRs abertos do wisp em tópicos',
      '2026-11-19: resume os PRs abertos do wisp em tópicos'
    ],
    skillNames: () => ['ja-existe'],
    skillsReady: (names) => ready.push(names)
  })
  const found = await distiller.suggestSkills()
  assert.deepEqual(
    found.map((item) => item.name),
    ['resumo-prs']
  )
  assert.deepEqual(ready, [['resumo-prs']])
  assert.match(prompts[0], /<pedidos>\n2026-11-16: resume os PRs/)
  assert.match(prompts[0], /As skills que ele já tem: ja-existe/)
  // Rodar de novo não sugere a mesma.
  await distiller.suggestSkills()
  assert.equal(distiller.skillSuggestions().length, 1)
  const info = await cleanupAction('status', distiller, config, root)
  assert.equal(info.skills[0].name, 'resumo-prs')
  assert.ok(isWispSkill(info.skills[0].text))
  assert.equal(info.skills[0].exists, false)
  const created = await cleanupAction('skill-accept:resumo-prs', distiller, config, root)
  assert.match(created.message ?? '', /Skill criada/)
  assert.ok(existsSync(skillFile('resumo-prs', config)))
  assert.equal(created.skills.length, 0)
  // Poucos pedidos: nem pergunta.
  const quiet = new Distiller({
    memory,
    load: () => null,
    excluded: () => [],
    enabled: () => true,
    ask: async () => {
      throw new Error('não devia perguntar')
    },
    file: join(root, 'outro.json'),
    recentRequests: () => ['2026-11-19: oi']
  })
  assert.deepEqual(await quiet.suggestSkills(), [])
})

test('skills: os pedidos da semana vêm das conversas que valem para a memória', () => {
  const history = new History(join(HOME, 'conversas-skills'))
  history.user(randomUUID(), 'resume os PRs abertos', [], false)
  history.record({ type: 'reset' })
  history.anonymous = true
  history.user(randomUUID(), 'um segredo da conversa anônima', [], false)
  history.record({ type: 'reset' })
  const requests = recentRequests(history)
  assert.equal(requests.length, 1)
  assert.match(requests[0], /^\d{4}-\d{2}-\d{2}: resume os PRs abertos$/)
  assert.ok(readdirSync(join(HOME, 'conversas-skills')).length === 2)
})

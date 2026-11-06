// Os subagentes pelo Wisp (Fase 50): o arquivo que o Claude Code lê (o cabeçalho com o nome, a
// descrição, as ferramentas e o modelo, e o prompt), o que o formulário não pode mandar, a prévia
// com o diff, o backup do arquivo velho e o gravar que só vale com o arquivo como na prévia; e a
// lista, com os do projeto e os pessoais.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkAgent, listAgents, previewAgent, renderAgent, saveAgent } from '../src/main/agents'
import { parseFrontmatter } from '../src/main/skills'
import type { AgentSpec } from '../src/shared/ipc'

const config = join(HOME, 'claude-agentes')
const project = join(HOME, 'projeto-agentes')
mkdirSync(project, { recursive: true })

const spec = (patch: Partial<AgentSpec> = {}): AgentSpec => ({
  scope: 'personal',
  name: 'revisor',
  description: 'Revisa o código: bugs, segurança e clareza.',
  prompt: 'Você é um revisor cuidadoso.\n\nLeia o diff.',
  tools: 'Read, Grep',
  model: 'sonnet',
  ...patch
})

test('agentes: o arquivo que o Claude Code lê', () => {
  const text = renderAgent(spec())
  const head = parseFrontmatter(text)
  assert.equal(head.name, 'revisor')
  assert.equal(head.description, 'Revisa o código: bugs, segurança e clareza.')
  assert.equal(head.tools, 'Read, Grep')
  assert.equal(head.model, 'sonnet')
  assert.ok(text.endsWith('Você é um revisor cuidadoso.\n\nLeia o diff.\n'))
  // Sem ferramentas e sem modelo, os campos ficam de fora (todas, e o modelo da conversa).
  const bare = renderAgent(spec({ tools: ' ', model: '' }))
  assert.equal(/^tools:/m.test(bare), false)
  assert.equal(/^model:/m.test(bare), false)
  // Uma descrição com quebra de linha e aspas não quebra o YAML.
  const tricky = parseFrontmatter(renderAgent(spec({ description: 'Use: "sempre"\nque der' })))
  assert.equal(tricky.description, 'Use: "sempre" que der')
  const quote = parseFrontmatter(renderAgent(spec({ description: "it's: ok" })))
  assert.equal(quote.description, "it's: ok")
})

test('agentes: o que o formulário não pode mandar', () => {
  assert.equal(checkAgent(spec()), null)
  assert.notEqual(checkAgent(spec({ name: 'Revisor' })), null)
  assert.notEqual(checkAgent(spec({ name: '../fora' })), null)
  assert.notEqual(checkAgent(spec({ description: ' ' })), null)
  assert.notEqual(checkAgent(spec({ prompt: '' })), null)
  assert.notEqual(checkAgent(spec({ model: 'gpt' })), null)
  assert.notEqual(checkAgent(spec({ tools: 'Read; rm -rf' })), null)
  assert.equal(checkAgent(spec({ tools: 'Bash(git:*), mcp__x__y' })), null)
})

test('agentes: a prévia, o gravar, o backup e o arquivo mudado depois da prévia', () => {
  const first = previewAgent(spec(), null, config)
  assert.ok(!('error' in first))
  if ('error' in first) return
  assert.equal(first.exists, false)
  assert.equal(first.path, join(config, 'agents', 'revisor.md'))
  assert.ok(first.diff.added > 0)
  assert.equal(saveAgent(spec(), null, first.fingerprint, config).ok, true)
  assert.equal(readFileSync(first.path, 'utf8'), renderAgent(spec()))

  // Editar: a prévia mostra o que muda, e o de antes ganha um backup ao lado.
  const edited = spec({ model: 'opus' })
  const second = previewAgent(edited, null, config)
  if ('error' in second) return assert.fail(second.error)
  assert.equal(second.exists, true)
  assert.equal(second.diff.added, 1)
  assert.equal(second.diff.removed, 1)
  // Alguém mexeu no arquivo depois da prévia: não grava.
  writeFileSync(first.path, renderAgent(spec({ model: 'haiku' })))
  const stale = saveAgent(edited, null, second.fingerprint, config)
  assert.equal(stale.ok, false)
  const third = previewAgent(edited, null, config)
  if ('error' in third) return assert.fail(third.error)
  const saved = saveAgent(edited, null, third.fingerprint, config)
  assert.equal(saved.ok, true, saved.message)
  const files = readdirSync(join(config, 'agents'))
  assert.equal(files.filter((name) => name.startsWith('revisor.md.backup-wisp-')).length, 1)
  assert.match(readFileSync(first.path, 'utf8'), /^model: opus$/m)
})

test('agentes: os do projeto e os pessoais', () => {
  const inProject = previewAgent(spec({ scope: 'project', name: 'testes' }), project, config)
  if ('error' in inProject) return assert.fail(inProject.error)
  assert.equal(inProject.path, join(project, '.claude', 'agents', 'testes.md'))
  saveAgent(spec({ scope: 'project', name: 'testes' }), project, inProject.fingerprint, config)
  // Sem a pasta da conversa, não há "do projeto".
  assert.ok('error' in previewAgent(spec({ scope: 'project' }), null, config))
  const listed = listAgents(project, config)
  assert.deepEqual(
    listed.map((agent) => [agent.scope, agent.name]),
    [
      ['project', 'testes'],
      ['personal', 'revisor']
    ]
  )
  assert.equal(listed[1].model, 'opus')
  assert.equal(listed[1].prompt, 'Você é um revisor cuidadoso.\n\nLeia o diff.')
  // Os backups não entram na lista.
  assert.equal(listAgents(null, config).length, 1)
  assert.ok(existsSync(join(project, '.claude', 'agents', 'testes.md')))
})

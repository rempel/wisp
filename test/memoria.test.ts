// A memória à vista (Fase 65): onde fica cada CLAUDE.md, a lista, a prévia com o diff e o gravar
// com o backup, só com o arquivo ainda como na prévia.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { listMemory, memoryPath, previewMemory, saveMemory } from '../src/main/memory'

const config = join(HOME, '.claude')
const data = join(HOME, 'dados')
const project = join(HOME, 'projeto')
mkdirSync(config, { recursive: true })
mkdirSync(project, { recursive: true })

test('memória: onde fica cada arquivo', () => {
  assert.equal(memoryPath('user', null, config, data), join(config, 'CLAUDE.md'))
  assert.equal(memoryPath('workspace', null, config, data), join(data, 'workspace', 'CLAUDE.md'))
  assert.equal(memoryPath('project', project, config, data), join(project, 'CLAUDE.md'))
  assert.equal(
    memoryPath('project-dir', project, config, data),
    join(project, '.claude', 'CLAUDE.md')
  )
  assert.equal(memoryPath('local', project, config, data), join(project, 'CLAUDE.local.md'))
  // Sem pasta (ou com uma que sumiu), não há memória de projeto.
  assert.equal(memoryPath('project', null, config, data), null)
  assert.equal(memoryPath('project', join(HOME, 'sumiu'), config, data), null)
})

test('memória: a lista traz o texto do que existe', () => {
  writeFileSync(join(config, 'CLAUDE.md'), '# Minhas regras\n')
  const without = listMemory(null, config, data)
  assert.deepEqual(
    without.map((file) => [file.id, file.exists]),
    [
      ['user', true],
      ['workspace', false]
    ]
  )
  assert.equal(without[0].text, '# Minhas regras\n')
  assert.equal(listMemory(project, config, data).length, 5)
})

test('memória: a prévia mostra o diff, e gravar faz o backup', () => {
  const preview = previewMemory('user', null, '# Minhas regras\n\n- Responda curto.', config, data)
  assert.ok(!('error' in preview))
  assert.equal(preview.exists, true)
  assert.equal(preview.unchanged, false)
  assert.ok(preview.diff.hunks.length > 0)
  // O mesmo texto (com espaços no fim): nada muda.
  const same = previewMemory('user', null, '# Minhas regras\n\n\n', config, data)
  assert.ok(!('error' in same) && same.unchanged)

  const saved = saveMemory(
    'user',
    null,
    '# Minhas regras\n\n- Responda curto.',
    preview.fingerprint,
    config,
    data
  )
  assert.equal(saved.ok, true, saved.message)
  assert.equal(
    readFileSync(join(config, 'CLAUDE.md'), 'utf8'),
    '# Minhas regras\n\n- Responda curto.\n'
  )
  const backups = readdirSync(config).filter((name) => name.startsWith('CLAUDE.md.backup-wisp-'))
  assert.equal(backups.length, 1)
  assert.equal(readFileSync(join(config, backups[0]), 'utf8'), '# Minhas regras\n')
})

test('memória: gravar só vale com o arquivo como na prévia', () => {
  const preview = previewMemory('user', null, 'novo', config, data)
  assert.ok(!('error' in preview))
  writeFileSync(join(config, 'CLAUDE.md'), 'mexido por fora\n')
  const refused = saveMemory('user', null, 'novo', preview.fingerprint, config, data)
  assert.equal(refused.ok, false)
  assert.equal(readFileSync(join(config, 'CLAUDE.md'), 'utf8'), 'mexido por fora\n')
})

test('memória: criar um arquivo novo (e a pasta dele), sem backup', () => {
  const preview = previewMemory(
    'project-dir',
    project,
    'Rode os testes com npm test.',
    config,
    data
  )
  assert.ok(!('error' in preview) && !preview.exists)
  const saved = saveMemory(
    'project-dir',
    project,
    'Rode os testes com npm test.',
    preview.fingerprint,
    config,
    data
  )
  assert.equal(saved.ok, true)
  assert.equal(
    readFileSync(join(project, '.claude', 'CLAUDE.md'), 'utf8'),
    'Rode os testes com npm test.\n'
  )
  assert.deepEqual(readdirSync(join(project, '.claude')), ['CLAUDE.md'])
  // Sem pasta, a memória do projeto não tem onde gravar.
  assert.ok('error' in previewMemory('project', null, 'x', config, data))
  assert.ok('error' in previewMemory('user', null, 'x'.repeat(200_001), config, data))
})

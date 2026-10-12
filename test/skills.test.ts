// As skills (skills.ts): o cabeçalho do SKILL.md, as pessoais e as dos plugins, instalar de uma
// pasta (com as conferências) e as skills pessoais pela OpenRouter (o link).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  inspectSkill,
  installSkill,
  listSkills,
  parseFrontmatter,
  pluginDirs
} from '../src/main/skills'
import { linkPersonalSkills } from '../src/main/openrouter'

const CONFIG = join(HOME, '.claude')
const skill = (dir: string, text: string): string => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), text)
  return dir
}

test('o cabeçalho do SKILL.md: na linha, com aspas, dobrado e em lista', () => {
  assert.deepEqual(
    parseFrontmatter(
      [
        '---',
        'name: pdf',
        'description: "Lê e cria PDFs: tabelas, formulários"',
        'when_to_use: >',
        '  quando houver',
        '  um PDF',
        'allowed-tools:',
        '  - Bash',
        '  - Read',
        'tags: [a, "b"]',
        '---',
        'corpo'
      ].join('\n')
    ),
    {
      name: 'pdf',
      description: 'Lê e cria PDFs: tabelas, formulários',
      when_to_use: 'quando houver um PDF',
      'allowed-tools': 'Bash, Read',
      tags: 'a, b'
    }
  )
  assert.deepEqual(parseFrontmatter('sem cabeçalho'), {})
})

test('as pessoais e as dos plugins (installed_plugins.json, v1 e v2)', () => {
  skill(join(CONFIG, 'skills/resumo'), '---\nname: resumo\ndescription: Resume textos\n---\n')
  skill(join(CONFIG, 'skills/sem-nome'), 'Só o corpo.')
  mkdirSync(join(CONFIG, 'skills/vazia'), { recursive: true })
  const plugin = join(CONFIG, 'plugins/cache/oficial/docs/1.0')
  skill(
    join(plugin, 'skills/docx'),
    '---\nname: docx\ndescription: Word\nallowed-tools: Bash\n---\n'
  )
  mkdirSync(join(CONFIG, 'plugins'), { recursive: true })
  writeFileSync(
    join(CONFIG, 'plugins/installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: { 'docs@oficial': [{ scope: 'user', installPath: plugin }] }
    })
  )
  assert.deepEqual(pluginDirs(CONFIG), [{ name: 'docs', path: plugin }])
  const skills = listSkills(CONFIG)
  assert.deepEqual(
    skills.map((s) => [s.origin, s.plugin ?? null, s.name, s.description, s.allowedTools ?? null]),
    [
      ['personal', null, 'resumo', 'Resume textos', null],
      ['personal', null, 'sem-nome', '', null],
      ['plugin', 'docs', 'docx', 'Word', 'Bash']
    ]
  )
  writeFileSync(
    join(CONFIG, 'plugins/installed_plugins.json'),
    JSON.stringify({ plugins: { 'docs@oficial': { installPath: plugin } } })
  )
  assert.deepEqual(pluginDirs(CONFIG), [{ name: 'docs', path: plugin }], 'a versão 1 também')
  assert.deepEqual(pluginDirs(join(HOME, 'nada')), [])
})

test('instalar de uma pasta: a prévia, a cópia e o que não passa', () => {
  const source = skill(
    join(HOME, 'baixadas/tradutor'),
    '---\nname: tradutor\ndescription: Traduz\n---\nTraduza.'
  )
  mkdirSync(join(source, 'exemplos'))
  writeFileSync(join(source, 'exemplos/a.txt'), 'oi')
  mkdirSync(join(source, '.git'))
  writeFileSync(join(source, '.git/HEAD'), 'x')
  const preview = inspectSkill(source, CONFIG)
  assert.equal(preview.name, 'tradutor')
  assert.equal(preview.files, 2, 'sem o .git')
  installSkill(source, CONFIG)
  assert.equal(readFileSync(join(CONFIG, 'skills/tradutor/exemplos/a.txt'), 'utf8'), 'oi')
  assert.equal(existsSync(join(CONFIG, 'skills/tradutor/.git')), false)
  assert.throws(() => installSkill(source, CONFIG), /Já existe uma skill "tradutor"/)
  assert.throws(() => inspectSkill(join(HOME, 'baixadas'), CONFIG), /não tem um SKILL.md/)
  const bad = skill(join(HOME, 'baixadas/Ruim'), '---\nname: Nome Ruim\n---\n')
  assert.throws(() => inspectSkill(bad, CONFIG), /não serve/)
  const linked = skill(join(HOME, 'baixadas/com-link'), '---\nname: com-link\n---\n')
  symlinkSync('/etc/passwd', join(linked, 'senha'))
  assert.throws(() => inspectSkill(linked, CONFIG), /é um link/)
})

test('pela OpenRouter, as skills pessoais entram por um link (e só elas)', () => {
  const orDir = join(HOME, 'or-config')
  mkdirSync(orDir, { recursive: true })
  linkPersonalSkills(join(CONFIG, 'skills'), orDir)
  assert.equal(lstatSync(join(orDir, 'skills')).isSymbolicLink(), true)
  assert.equal(readlinkSync(join(orDir, 'skills')), join(CONFIG, 'skills'))
  linkPersonalSkills(join(CONFIG, 'skills'), orDir)
  const own = join(HOME, 'or-config-2')
  mkdirSync(join(own, 'skills'), { recursive: true })
  linkPersonalSkills(join(CONFIG, 'skills'), own)
  assert.equal(lstatSync(join(own, 'skills')).isSymbolicLink(), false, 'uma pasta de verdade fica')
  const none = join(HOME, 'or-config-3')
  mkdirSync(none)
  linkPersonalSkills(join(HOME, 'sem-skills'), none)
  assert.equal(existsSync(join(none, 'skills')), false)
})

// Os projetos (Fase 77): de que projeto é uma pasta, o nome e a cor de costume, e o que o
// config.json aceita.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSettings } from '../src/main/config'
import { defaultProjectName, nextProjectColor, projectOf } from '../src/shared/projects'
import type { Project } from '../src/shared/projects'

const project = (folder: string, extra: Partial<Project> = {}): Project => ({
  folder,
  name: defaultProjectName(folder),
  color: 'cyan',
  mode: null,
  ...extra
})

test('de que projeto é uma pasta: a própria, uma de dentro, e o mais específico ganha', () => {
  const projects = [project('/home/eu/loja'), project('/home/eu/loja/painel', { color: 'green' })]
  assert.equal(projectOf('/home/eu/loja', projects)?.name, 'loja')
  assert.equal(projectOf('/home/eu/loja/', projects)?.name, 'loja')
  assert.equal(projectOf('/home/eu/loja/src/api', projects)?.name, 'loja')
  assert.equal(projectOf('/home/eu/loja/painel/src', projects)?.name, 'painel')
  // Um nome que só começa igual não é a mesma pasta.
  assert.equal(projectOf('/home/eu/loja-antiga', projects), null)
  assert.equal(projectOf('/home/eu', projects), null)
  assert.equal(projectOf(null, projects), null)
  assert.equal(projectOf('C:\\proj\\app\\src', [project('C:\\proj\\app')])?.name, 'app')
})

test('o nome e a cor de costume de um projeto novo', () => {
  assert.equal(defaultProjectName('/home/eu/minha-loja/'), 'minha-loja')
  assert.equal(nextProjectColor([]), 'cyan')
  assert.equal(nextProjectColor([project('/a'), project('/b', { color: 'green' })]), 'amber')
})

test('o config aceita projetos bem formados, sem pasta repetida', () => {
  const ok = (projects: unknown): boolean => checkSettings({ projects }).ok
  assert.ok(ok([]))
  assert.ok(ok([project('/home/eu/loja', { mode: 'plan' })]))
  assert.ok(!ok([project('/a'), project('/a')]), 'a mesma pasta duas vezes')
  assert.ok(!ok([{ ...project('/a'), color: 'roxo' }]))
  assert.ok(!ok([{ ...project('/a'), mode: 'bypassPermissions' }]))
  assert.ok(!ok([{ ...project('/a'), name: '' }]))
  assert.ok(!ok('texto'))
})

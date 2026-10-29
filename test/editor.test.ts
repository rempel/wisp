// O editor do VS Code no painel (Fase 34), no que dá para conferir sem a página: os dois lados que
// o diff do Monaco compara (com os números das linhas do arquivo), as linhas que a edição pôs, o
// arquivo de uma chamada, os arquivos de segredos que o painel não mostra (nem por um link) e os
// limites de ler um arquivo para o visualizador.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { isSensitivePath } from '../src/main/claude-settings'
import { readForView, VIEW_LIMIT } from '../src/main/file-view'
import {
  buildDiff,
  changedLines,
  diffFromResult,
  diffSides,
  lineDiff,
  pathOf
} from '../src/shared/diff'

const edit = diffFromResult({
  structuredPatch: [
    {
      oldStart: 10,
      newStart: 10,
      lines: [' const a = 1', '-const b = 2', '+const b = 3', '+const c = 4', ' const d = 5']
    },
    { oldStart: 40, newStart: 41, lines: [' x', '-y', '\\ No newline at end of file'] }
  ]
})!

test('os dois lados do diff, com os números das linhas do arquivo', () => {
  const sides = diffSides(edit)
  assert.equal(sides.original, 'const a = 1\nconst b = 2\nconst d = 5\nx\ny')
  assert.equal(sides.modified, 'const a = 1\nconst b = 3\nconst c = 4\nconst d = 5\nx')
  assert.deepEqual(sides.originalLines, [10, 11, 12, 40, 41])
  assert.deepEqual(sides.modifiedLines, [10, 11, 12, 13, 41])
  // O segundo trecho começa depois de 3 linhas de antes e 4 de depois.
  assert.deepEqual(sides.breaks, [{ original: 3, modified: 4 }])
  // Sem saber onde no arquivo (a prévia de um Edit), as linhas ficam sem número.
  const preview = diffSides(buildDiff([lineDiff('a\nb', 'a\nc')]))
  assert.deepEqual(preview.modifiedLines, [0, 0])
  assert.equal(preview.modified, 'a\nc')
})

test('as linhas que a edição pôs, e o arquivo de uma chamada', () => {
  assert.deepEqual(changedLines(edit), [11, 12])
  assert.deepEqual(changedLines(buildDiff([lineDiff('a', 'b')])), [])
  assert.equal(pathOf({ file_path: '/p/a.ts' }), '/p/a.ts')
  assert.equal(pathOf({ notebook_path: '/p/n.ipynb' }), '/p/n.ipynb')
  assert.equal(pathOf({ command: 'ls' }), '')
  assert.equal(pathOf(null), '')
})

test('os arquivos de segredos: os mesmos que o Claude só lê com aprovação', () => {
  const home = '/home/ana'
  for (const path of [
    '/home/ana/.ssh/id_ed25519',
    '/home/ana/.aws/credentials',
    '/home/ana/.config/gh/hosts.yml',
    '/home/ana/.docker/config.json',
    '/srv/app/.env',
    '/srv/app/.env.local'
  ]) {
    assert.equal(isSensitivePath(path, home), true, path)
  }
  for (const path of [
    '/home/ana/projeto/src/app.ts',
    '/home/ana/projeto/env.ts',
    '/home/ana/.sshd',
    '/home/bia/.ssh/id_rsa'
  ]) {
    assert.equal(isSensitivePath(path, home), false, path)
  }
})

test('ler para o visualizador: texto, nada de segredos (nem por link), binário ou grande demais', () => {
  const dir = join(HOME, 'ver')
  mkdirSync(join(HOME, '.ssh'), { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'app.ts'), 'const a = 1\n')
  writeFileSync(join(HOME, '.ssh', 'id_rsa'), 'CHAVE')
  writeFileSync(join(dir, 'imagem.png'), Buffer.from([0x89, 0x50, 0, 0x47]))
  writeFileSync(join(dir, 'grande.log'), Buffer.alloc(VIEW_LIMIT + 1, 'a'))
  assert.deepEqual(readForView(join(dir, 'app.ts'), HOME), { ok: true, text: 'const a = 1\n' })
  const refused = (path: unknown): string => {
    const result = readForView(path, HOME)
    assert.equal(result.ok, false)
    return result.ok ? '' : result.message
  }
  assert.match(refused(join(HOME, '.ssh', 'id_rsa')), /segredos/)
  if (process.platform !== 'win32') {
    // Um link com outro nome, para a chave: o caminho real é que vale.
    symlinkSync(join(HOME, '.ssh', 'id_rsa'), join(dir, 'notas.txt'))
    assert.match(refused(join(dir, 'notas.txt')), /segredos/)
  }
  assert.match(refused(join(dir, 'imagem.png')), /binário/)
  assert.match(refused(join(dir, 'grande.log')), /grande demais/)
  assert.match(refused(dir), /Não é um arquivo/)
  assert.match(refused(join(dir, 'sumiu.ts')), /não existe/)
  assert.match(refused('relativo/app.ts'), /inválido/)
  assert.match(refused(42), /inválido/)
})

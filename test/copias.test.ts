// A conversa numa cópia (Fase 43), com o git de verdade num repositório de teste: criar a cópia
// num ramo novo, ver o que mudou (os arquivos novos também), juntar na pasta original (sem commit,
// e de novo só o que mudou depois), recusar o que não entra limpo sem mexer em nada, descartar e,
// ao abrir o Wisp, tirar as cópias sem mudança.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { gitRunner, Worktrees } from '../src/main/worktrees'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

function repo(name: string): string {
  const dir = join(HOME, name)
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'teste@exemplo.com')
  git(dir, 'config', 'user.name', 'Teste')
  // O git do Windows do CI troca as quebras de linha (core.autocrlf): o teste compara o texto.
  git(dir, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(dir, 'app.ts'), 'const a = 1\nconst b = 2\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'início')
  return dir
}

const make = (name: string): Worktrees =>
  new Worktrees(gitRunner('git'), join(HOME, `copias-${name}`), join(HOME, `${name}.json`))

test('a cópia: um ramo novo, as mudanças, juntar (e juntar de novo só o que mudou depois)', async () => {
  const original = repo('projeto')
  const worktrees = make('a')
  const copy = await worktrees.create(join(original))
  assert.match(copy.branch, /^wisp\/[0-9a-f]{6}$/)
  assert.ok(existsSync(join(copy.dir, 'app.ts')))
  assert.equal(worktrees.byDir(copy.dir)?.branch, copy.branch)
  writeFileSync(join(copy.dir, 'app.ts'), 'const a = 1\nconst b = 3\n')
  writeFileSync(join(copy.dir, 'novo.ts'), 'export {}\n')
  assert.deepEqual(
    (await worktrees.changes(copy)).map((c) => [c.path, c.added, c.removed]),
    [
      ['app.ts', 1, 1],
      ['novo.ts', 1, 0]
    ]
  )
  // Na pasta original, nada ainda.
  assert.equal(readFileSync(join(original, 'app.ts'), 'utf8'), 'const a = 1\nconst b = 2\n')
  assert.deepEqual(await worktrees.join(copy), { files: 2 })
  assert.equal(readFileSync(join(original, 'app.ts'), 'utf8'), 'const a = 1\nconst b = 3\n')
  assert.ok(existsSync(join(original, 'novo.ts')))
  // Sem commit na pasta original: as mudanças ficam para você.
  assert.equal(git(original, 'log', '--oneline').trim().split('\n').length, 1)
  // Juntar de novo, sem mudança nova: nada.
  const again = worktrees.byDir(copy.dir)!
  assert.deepEqual(await worktrees.join(again), { files: 0 })
  assert.deepEqual(await worktrees.changes(again), [])
  // Uma mudança nova na cópia: só ela vai.
  writeFileSync(join(copy.dir, 'app.ts'), 'const a = 1\nconst b = 3\nconst c = 4\n')
  assert.deepEqual(await worktrees.join(worktrees.byDir(copy.dir)!), { files: 1 })
  assert.equal(
    readFileSync(join(original, 'app.ts'), 'utf8'),
    'const a = 1\nconst b = 3\nconst c = 4\n'
  )
  await worktrees.discard(worktrees.byDir(copy.dir)!)
  assert.equal(existsSync(copy.dir), false)
  assert.doesNotMatch(git(original, 'branch'), /wisp\//)
  assert.deepEqual(worktrees.list(), [])
})

test('a cópia: o que não entra limpo não mexe na pasta original, e o ramo fica', async () => {
  const original = repo('conflito')
  const worktrees = make('b')
  const copy = await worktrees.create(original)
  writeFileSync(join(copy.dir, 'app.ts'), 'const a = 1\nconst b = 3\n')
  // Na pasta original, a mesma linha mudou de outro jeito.
  writeFileSync(join(original, 'app.ts'), 'const a = 1\nconst b = 9\n')
  await assert.rejects(worktrees.join(copy), /não entram limpas.*wisp\//s)
  assert.equal(readFileSync(join(original, 'app.ts'), 'utf8'), 'const a = 1\nconst b = 9\n')
  assert.match(git(original, 'branch'), new RegExp(copy.branch))
})

test('a cópia: só de um repositório com commit; ao abrir, as sem mudança saem', async () => {
  const worktrees = make('c')
  const plain = join(HOME, 'sem-git')
  mkdirSync(plain, { recursive: true })
  await assert.rejects(worktrees.create(plain), /não é um repositório do Git/)
  const original = repo('arrumar')
  const clean = await worktrees.create(original)
  const dirty = await worktrees.create(original)
  const open = await worktrees.create(original)
  writeFileSync(join(dirty.dir, 'app.ts'), 'mudou\n')
  await worktrees.tidy((dir) => dir === open.dir)
  assert.deepEqual(
    worktrees
      .list()
      .map((item) => item.dir)
      .sort(),
    [dirty.dir, open.dir].sort()
  )
  assert.equal(existsSync(clean.dir), false)
})

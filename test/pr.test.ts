// Revisar um PR (Fase 78): o número ou o endereço, o que o gh devolve (conferido), o pedido que
// vai para a caixa e a preparação de verdade, com o git e um gh de mentira: a cópia do projeto
// nasce, o checkout do PR roda nela, e uma falha desfaz a cópia.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parsePrInfo, preparePrReview, prReference, reviewPrompt } from '../src/main/pr-review'
import { gitRunner, Worktrees } from '../src/main/worktrees'

const unixOnly = { skip: process.platform === 'win32' && 'o gh de mentira é um script do sh' }

test('o PR pedido: o número, com ou sem #, ou o endereço do GitHub', () => {
  assert.deepEqual(prReference('123'), { number: 123 })
  assert.deepEqual(prReference(' #45 '), { number: 45 })
  assert.deepEqual(prReference('https://github.com/rempel/wisp/pull/7'), {
    number: 7,
    repo: 'rempel/wisp'
  })
  assert.deepEqual(prReference('https://github.com/a/b.c/pull/9/files#diff-1'), {
    number: 9,
    repo: 'a/b.c'
  })
  assert.equal(prReference(''), null)
  assert.equal(prReference('abc'), null)
  assert.equal(prReference('https://example.com/a/b/pull/1'), null)
  assert.equal(prReference('123; rm -rf ~'), null)
  assert.equal(prReference('https://github.com/a/b --repo x/pull/1'), null)
})

test('o que o gh devolve é conferido: o ramo de base vai num comando', () => {
  const pr = parsePrInfo({
    number: 7,
    title: 'Arruma  o\ncontador',
    url: 'https://github.com/rempel/wisp/pull/7',
    baseRefName: 'main',
    author: { login: 'ana' }
  })
  assert.deepEqual(pr, {
    number: 7,
    title: 'Arruma o contador',
    url: 'https://github.com/rempel/wisp/pull/7',
    base: 'main',
    author: 'ana'
  })
  assert.equal(parsePrInfo({ number: 7, title: 'x', baseRefName: 'main`rm -rf ~`' }), null)
  assert.equal(parsePrInfo({ number: 7, title: 'x', baseRefName: '' }), null)
  assert.equal(parsePrInfo({ title: 'sem número', baseRefName: 'main' }), null)
  assert.equal(parsePrInfo(null), null)
  // Um endereço que não é do GitHub não vai para o pedido.
  assert.equal(
    parsePrInfo({ number: 1, title: 'x', baseRefName: 'main', url: 'http://mal' })?.url,
    ''
  )
  const prompt = reviewPrompt(pr!)
  assert.match(prompt, /PR #7, "Arruma o contador", de ana/)
  assert.match(prompt, /git diff origin\/main\.\.\.HEAD/)
  assert.match(prompt, /Não edite arquivos nem publique nada/)
})

test(
  'a preparação: a cópia nasce, o checkout do PR roda nela; uma falha a desfaz',
  unixOnly,
  async () => {
    const repo = join(HOME, 'repo')
    mkdirSync(repo, { recursive: true })
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'teste@example.com')
    git('config', 'user.name', 'Teste')
    writeFileSync(join(repo, 'a.txt'), 'oi\n')
    git('add', '.')
    git('commit', '-q', '-m', 'começo')

    // Um gh de mentira: o `pr view` devolve o PR; o `pr checkout` anota onde rodou (ou falha).
    const log = join(HOME, 'gh.log')
    const gh = join(HOME, 'gh')
    writeFileSync(
      gh,
      `#!/bin/sh
echo "$PWD :: $*" >> "${log}"
if [ "$2" = "view" ]; then
  echo '{"number":7,"title":"Arruma o contador","url":"https://github.com/rempel/wisp/pull/7","baseRefName":"main","author":{"login":"ana"}}'
  exit 0
fi
if [ "$2" = "checkout" ] && [ -f "${join(HOME, 'falhar')}" ]; then
  echo "could not find pull request" >&2
  exit 1
fi
exit 0
`
    )
    chmodSync(gh, 0o755)
    const worktrees = new Worktrees(
      gitRunner('git'),
      join(HOME, 'copias'),
      join(HOME, 'copias.json')
    )

    const review = await preparePrReview({ gh, folder: repo, worktrees, reference: { number: 7 } })
    assert.ok(existsSync(join(review.dir, 'a.txt')), 'a cópia tem os arquivos do projeto')
    assert.equal(worktrees.list().length, 1)
    assert.match(review.prompt, /PR #7/)
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    assert.match(calls[0], /repo :: pr view 7 --json number,title,url,baseRefName,author$/)
    // O checkout roda dentro da cópia, sem mexer na pasta original.
    assert.ok(calls[1].startsWith(`${review.dir} :: pr checkout 7 --detach`), calls[1])

    // Com o endereço de outro repositório, o --repo vai junto.
    await preparePrReview({ gh, folder: repo, worktrees, reference: { number: 7, repo: 'a/b' } })
    assert.match(readFileSync(log, 'utf8'), /pr view 7 --repo a\/b --json/)
    assert.equal(worktrees.list().length, 2)

    // O checkout falhou: o motivo volta, e a cópia que nasceu para ele sai.
    writeFileSync(join(HOME, 'falhar'), '')
    await assert.rejects(
      preparePrReview({ gh, folder: repo, worktrees, reference: { number: 7 } }),
      /could not find pull request/
    )
    assert.equal(worktrees.list().length, 2)
    // Sem o gh: o motivo diz.
    await assert.rejects(
      preparePrReview({
        gh: join(HOME, 'nao-existe'),
        folder: repo,
        worktrees,
        reference: { number: 1 }
      }),
      /gh/
    )
  }
)

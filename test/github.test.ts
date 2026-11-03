// Os alertas do GitHub: a resposta do gh conferida, o que mudou entre duas leituras (CI e
// revisões dos seus PRs, pedidos de revisão), os textos e o vigia, com um gh de mentira
// (test/fixtures/fake-gh): a primeira leitura só serve de base, a última fica salva para o que
// mudou com o app fechado, e o gh ausente ou sem login avisa uma vez.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  describeAlert,
  describeSnapshot,
  diffSnapshots,
  GithubWatcher,
  parseSnapshot,
  QUERY,
  investigatePrompt
} from '../src/main/github'
import type { GhProblem, GithubAlert, GithubSnapshot } from '../src/main/github'
import { FIXTURES } from './helpers/paths'

const GH = join(FIXTURES, 'fake-gh')
const RESPONSE = join(HOME, 'gh-response.json')
const LOG = join(HOME, 'gh.log')
process.env.FAKE_GH_RESPONSE = RESPONSE
process.env.FAKE_GH_LOG = LOG
process.env.ANTHROPIC_API_KEY = 'sk-de-mentira'

interface Pr {
  number: number
  ci?: string | null
  head?: string
  reviews?: { author: string; state: string; at: string }[]
  decision?: string | null
}

/** Uma resposta do GraphQL como a do GitHub, com os PRs pedidos. */
function response(
  mine: Pr[],
  requests: { number: number; author: string }[] = [],
  login = 'eu'
): unknown {
  return {
    data: {
      viewer: {
        login,
        pullRequests: {
          nodes: mine.map((pr) => ({
            number: pr.number,
            title: `PR ${pr.number}`,
            url: `https://github.com/eu/app/pull/${pr.number}`,
            isDraft: false,
            reviewDecision: pr.decision ?? null,
            repository: { nameWithOwner: 'eu/app' },
            commits: {
              nodes: [
                {
                  commit: {
                    oid: pr.head ?? 'a1',
                    statusCheckRollup: pr.ci === null ? null : { state: pr.ci ?? 'PENDING' }
                  }
                }
              ]
            },
            latestReviews: {
              nodes: (pr.reviews ?? []).map((r) => ({
                author: { login: r.author },
                state: r.state,
                submittedAt: r.at
              }))
            }
          }))
        }
      },
      search: {
        nodes: requests.map((r) => ({
          number: r.number,
          title: `Revisão ${r.number}`,
          url: `https://github.com/time/api/pull/${r.number}`,
          repository: { nameWithOwner: 'time/api' },
          author: { login: r.author }
        }))
      }
    }
  }
}
const snap = (...args: Parameters<typeof response>): GithubSnapshot =>
  parseSnapshot(response(...args)) as GithubSnapshot
const kinds = (alerts: GithubAlert[]): string[] =>
  alerts.map((a) =>
    a.kind === 'review'
      ? `review:${a.author}:${a.state}`
      : a.kind === 'review-requested'
        ? `requested:${a.request.number}`
        : `${a.kind}:${a.pr.number}`
  )

test('a resposta do gh, conferida: só links https, estados conhecidos', () => {
  const s = snap(
    [
      { number: 7, ci: 'FAILURE', decision: 'CHANGES_REQUESTED' },
      { number: 8, ci: null }
    ],
    [{ number: 3, author: 'ana' }]
  )
  assert.equal(s.login, 'eu')
  assert.deepEqual(
    s.mine.map((pr) => [pr.number, pr.ci, pr.decision]),
    [
      [7, 'failure', 'CHANGES_REQUESTED'],
      [8, 'none', null]
    ]
  )
  assert.equal(s.reviewRequests[0].author, 'ana')
  const evil = response([{ number: 1 }]) as {
    data: { viewer: { pullRequests: { nodes: { url: string }[] } } }
  }
  evil.data.viewer.pullRequests.nodes[0].url = 'javascript:alert(1)'
  assert.equal(parseSnapshot(evil)?.mine.length, 0, 'um link que não é https fica de fora')
  assert.equal(parseSnapshot({ errors: [{ message: 'x' }] }), null)
  assert.equal(parseSnapshot(null), null)
})

test('o que muda no CI vira alerta; o que não muda, não', () => {
  const pending = snap([{ number: 1, ci: 'PENDING' }])
  const failed = snap([{ number: 1, ci: 'FAILURE' }])
  assert.deepEqual(diffSnapshots(null, failed), [], 'a primeira leitura é só a base')
  assert.deepEqual(kinds(diffSnapshots(pending, failed)), ['ci-failed:1'])
  assert.deepEqual(diffSnapshots(failed, failed), [], 'continua vermelho: não repete')
  const again = snap([{ number: 1, ci: 'FAILURE', head: 'b2' }])
  assert.deepEqual(kinds(diffSnapshots(failed, again)), ['ci-failed:1'], 'falhou num commit novo')
  const passed = snap([{ number: 1, ci: 'SUCCESS', head: 'b2' }])
  assert.deepEqual(kinds(diffSnapshots(again, passed)), ['ci-passed:1'])
  assert.deepEqual(kinds(diffSnapshots(pending, snap([{ number: 1, ci: 'SUCCESS' }]))), [
    'ci-passed:1'
  ])
  const greenAgain = snap([{ number: 1, ci: 'SUCCESS', head: 'c3' }])
  assert.deepEqual(diffSnapshots(passed, greenAgain), [], 'verde de novo: sem barulho')
  assert.deepEqual(
    kinds(diffSnapshots(snap([]), failed)),
    ['ci-failed:1'],
    'um PR novo que já falhou'
  )
  assert.deepEqual(diffSnapshots(pending, snap([{ number: 1, ci: 'FAILURE' }], [], 'outra')), [])
})

test('revisões novas de outra pessoa e pedidos de revisão', () => {
  const before = snap([{ number: 1, ci: 'SUCCESS', reviews: [] }], [{ number: 3, author: 'ana' }])
  const after = snap(
    [
      {
        number: 1,
        ci: 'SUCCESS',
        reviews: [
          { author: 'bia', state: 'APPROVED', at: '2026-10-11T10:00:00Z' },
          { author: 'eu', state: 'COMMENTED', at: '2026-10-11T10:01:00Z' },
          { author: 'caio', state: 'DISMISSED', at: '2026-10-11T10:02:00Z' }
        ]
      }
    ],
    [
      { number: 3, author: 'ana' },
      { number: 4, author: 'davi' }
    ]
  )
  assert.deepEqual(kinds(diffSnapshots(before, after)), ['review:bia:APPROVED', 'requested:4'])
  assert.deepEqual(diffSnapshots(after, after), [])
  const later = snap(
    [
      {
        number: 1,
        ci: 'SUCCESS',
        reviews: [{ author: 'bia', state: 'CHANGES_REQUESTED', at: '2026-10-11T11:00:00Z' }]
      }
    ],
    [{ number: 4, author: 'davi' }]
  )
  assert.deepEqual(kinds(diffSnapshots(after, later)), ['review:bia:CHANGES_REQUESTED'])
})

test('os textos: título, PR e o link que o clique abre', () => {
  const s = snap([{ number: 7, ci: 'FAILURE' }], [{ number: 3, author: 'ana' }])
  assert.deepEqual(describeAlert({ kind: 'ci-failed', pr: s.mine[0] }), {
    title: 'O CI falhou',
    body: 'eu/app#7: PR 7',
    url: 'https://github.com/eu/app/pull/7'
  })
  assert.equal(
    describeAlert({ kind: 'review', pr: s.mine[0], author: 'bia', state: 'CHANGES_REQUESTED' })
      .title,
    'bia pediu mudanças no seu PR'
  )
  assert.equal(
    describeAlert({ kind: 'review-requested', request: s.reviewRequests[0] }).title,
    'ana pediu a sua revisão'
  )
  const text = describeSnapshot(s)
  assert.match(text, /eu\/app#7 "PR 7": CI falhou/)
  assert.match(text, /Pedem a sua revisão \(1\):\n- time\/api#3 "Revisão 3", de ana/)
})

test('investigar (Fase 41): o CI vermelho e o pedido de mudanças viram um pedido pronto; o resto, não', () => {
  const s = snap([{ number: 7, ci: 'FAILURE' }], [{ number: 3, author: 'ana' }])
  const ci = investigatePrompt({ kind: 'ci-failed', pr: s.mine[0] }) ?? ''
  assert.match(
    ci,
    /^O CI do PR eu\/app#7 "PR 7" falhou \(https:\/\/github\.com\/eu\/app\/pull\/7\)/
  )
  assert.match(ci, /gh pr checks 7 --repo eu\/app/)
  assert.match(ci, /gh run view --log-failed --repo eu\/app/)
  const review =
    investigatePrompt({
      kind: 'review',
      pr: s.mine[0],
      author: 'bia',
      state: 'CHANGES_REQUESTED'
    }) ?? ''
  assert.match(review, /^bia pediu mudanças no PR eu\/app#7/)
  assert.match(review, /gh pr view 7 --repo eu\/app --comments/)
  assert.equal(investigatePrompt({ kind: 'ci-passed', pr: s.mine[0] }), null)
  assert.equal(
    investigatePrompt({ kind: 'review', pr: s.mine[0], author: 'bia', state: 'APPROVED' }),
    null
  )
  assert.equal(investigatePrompt({ kind: 'review-requested', request: s.reviewRequests[0] }), null)
})

const calls = (): { args: string[]; apiKey: boolean; prompt: string | null }[] => {
  try {
    return readFileSync(LOG, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

test('o vigia: a base, os alertas depois, e a leitura salva para quando o app abrir de novo', async () => {
  const path = join(HOME, 'github-1.json')
  const alerts: GithubAlert[][] = []
  const watcher = new GithubWatcher({
    gh: () => GH,
    snapshotPath: path,
    onAlerts: (list) => alerts.push(list),
    onProblem: () => assert.fail('sem problema aqui')
  })
  writeFileSync(RESPONSE, JSON.stringify(response([{ number: 1, ci: 'PENDING' }])))
  assert.deepEqual(await watcher.poll(), [])
  assert.equal((statSync(path).mode & 0o777).toString(8), '600', 'só o usuário lê')
  const [call] = calls()
  assert.deepEqual(call.args.slice(0, 3), ['api', 'graphql', '-f'])
  assert.equal(call.args[3], `query=${QUERY}`)
  assert.equal(call.apiKey, false, 'a chave da Anthropic não vai para o gh')
  assert.equal(call.prompt, '1', 'o gh nunca pergunta nada')

  writeFileSync(RESPONSE, JSON.stringify(response([{ number: 1, ci: 'FAILURE' }])))
  assert.deepEqual(kinds(await watcher.poll()), ['ci-failed:1'])
  assert.deepEqual(kinds(alerts.flat()), ['ci-failed:1'])

  // O app fechou; no meio, o CI passou. Ao abrir, a leitura salva serve de base.
  writeFileSync(RESPONSE, JSON.stringify(response([{ number: 1, ci: 'SUCCESS' }])))
  const reopened = new GithubWatcher({
    gh: () => GH,
    snapshotPath: path,
    onAlerts: () => {},
    onProblem: () => {}
  })
  assert.equal(reopened.snapshot()?.mine[0].ci, 'failure')
  assert.deepEqual(kinds(await reopened.poll()), ['ci-passed:1'])

  // Uma leitura salva velha demais (de dias atrás) não serve: avisaria coisa demais.
  const old = JSON.parse(readFileSync(path, 'utf8')) as GithubSnapshot
  old.at = Date.now() - 3 * 24 * 3600_000
  writeFileSync(path, JSON.stringify(old))
  utimesSync(path, new Date(), new Date())
  assert.equal(
    new GithubWatcher({
      gh: () => GH,
      snapshotPath: path,
      onAlerts: () => {},
      onProblem: () => {}
    }).snapshot(),
    null
  )
})

test('sem o gh, sem login: avisa uma vez cada, e avisa quando voltar a funcionar', async () => {
  const problems: (GhProblem['kind'] | null)[] = []
  let gh: string | null = null
  const watcher = new GithubWatcher({
    gh: () => gh,
    snapshotPath: join(HOME, 'github-2.json'),
    onAlerts: () => {},
    onProblem: (problem) => problems.push(problem?.kind ?? null)
  })
  await watcher.poll()
  await watcher.poll()
  assert.deepEqual(problems, ['missing'], 'uma vez só')
  assert.equal(watcher.currentProblem(), 'missing')

  gh = GH
  process.env.FAKE_GH_EXIT = '4'
  process.env.FAKE_GH_STDERR = 'To get started with GitHub CLI, please run:  gh auth login'
  await watcher.poll()
  assert.deepEqual(problems, ['missing', 'login'])

  // Um erro de rede passa sozinho: não vira aviso.
  process.env.FAKE_GH_EXIT = '1'
  process.env.FAKE_GH_STDERR = 'error connecting to api.github.com'
  await watcher.poll()
  assert.deepEqual(problems, ['missing', 'login'])

  delete process.env.FAKE_GH_EXIT
  delete process.env.FAKE_GH_STDERR
  writeFileSync(RESPONSE, JSON.stringify(response([])))
  await watcher.poll()
  assert.deepEqual(problems, ['missing', 'login', null], 'voltou: avisa que resolveu')
  assert.equal(watcher.currentProblem(), null)
})

// Alertas do GitHub (Fase 13): os seus PRs abertos (CI que falhou ou passou, revisões) e os PRs
// em que pedem a sua revisão. Tudo passa pelo `gh` (GitHub CLI) já logado: o Wisp não guarda
// token nenhum, e o gh cuida da autenticação, do proxy e do GitHub Enterprise. Opcional e
// desligado por padrão (config.github).
//
// A cada poucos minutos, uma consulta GraphQL; a leitura nova é comparada com a anterior, e o que
// mudou vira alerta. A última leitura fica em ~/.local/share/wisp/github.json, para o que mudou
// com o app fechado também avisar quando ele abre.

import { spawn } from 'child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from './paths'
import { viaHost } from './host'
import { t, dateLocale } from '../shared/i18n'

export type CiState = 'success' | 'failure' | 'pending' | 'none'
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'

export interface PullRequest {
  repo: string
  number: number
  title: string
  url: string
  draft: boolean
  /** O commit mais novo do PR e o estado do CI nele. */
  head: string
  ci: CiState
  /** A decisão das revisões: aprovado, pedem mudanças, esperando revisão (ou nenhuma regra). */
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  /** A revisão mais nova de cada pessoa. */
  reviews: { author: string; state: ReviewState; at: string }[]
}

export interface ReviewRequest {
  repo: string
  number: number
  title: string
  url: string
  author: string
}

export interface GithubSnapshot {
  login: string
  /** Quando foi lida (ms). */
  at: number
  mine: PullRequest[]
  reviewRequests: ReviewRequest[]
}

export type GithubAlert =
  | { kind: 'ci-failed' | 'ci-passed'; pr: PullRequest }
  | { kind: 'review'; pr: PullRequest; author: string; state: ReviewState }
  | { kind: 'review-requested'; request: ReviewRequest }

/** A consulta: os seus PRs abertos e os que pedem a sua revisão. */
export const QUERY = `query {
  viewer {
    login
    pullRequests(first: 30, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url isDraft reviewDecision
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
        latestReviews(first: 20) { nodes { author { login } state submittedAt } }
      }
    }
  }
  search(query: "is:open is:pr review-requested:@me archived:false", type: ISSUE, first: 30) {
    nodes { ... on PullRequest { number title url repository { nameWithOwner } author { login } } }
  }
}`

/** De quanto em quanto tempo o Wisp pergunta (ms). */
export const POLL_MS = 3 * 60_000
/** Sem o gh ou sem login: pergunta de novo bem mais devagar, até o problema sumir (ms). */
export const PROBLEM_POLL_MS = 15 * 60_000
/** Uma leitura salva mais velha que isto não serve de base: avisaria coisa demais de uma vez. */
const SNAPSHOT_MAX_AGE_MS = 12 * 3600_000
/** No máximo tantos alertas de uma vez; o resto vira um resumo. */
export const MAX_ALERTS = 5

const SNAPSHOT_PATH = join(DATA_DIR, 'github.json')

type Json = Record<string, unknown>
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown, max = 300): string =>
  typeof value === 'string' ? value.slice(0, max) : ''
const https = (value: unknown): string => {
  const url = str(value, 500)
  return /^https:\/\/[^\s]+$/.test(url) ? url : ''
}

function ciOf(state: unknown): CiState {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'ERROR':
      return 'failure'
    case 'PENDING':
    case 'EXPECTED':
      return 'pending'
  }
  return 'none'
}

/** A resposta do gh, conferida campo a campo; null se não for o que a consulta devolve. */
export function parseSnapshot(raw: unknown, at = Date.now()): GithubSnapshot | null {
  const data = obj(obj(raw).data)
  const viewer = obj(data.viewer)
  const login = str(viewer.login, 100)
  if (!login) return null
  const mine: PullRequest[] = []
  for (const node of list(obj(viewer.pullRequests).nodes)) {
    const pr = obj(node)
    const url = https(pr.url)
    const number = pr.number
    if (!url || typeof number !== 'number') continue
    const commit = obj(obj(list(obj(pr.commits).nodes)[0]).commit)
    const decision = pr.reviewDecision
    mine.push({
      repo: str(obj(pr.repository).nameWithOwner, 200),
      number,
      title: str(pr.title),
      url,
      draft: pr.isDraft === true,
      head: str(commit.oid, 64),
      ci: ciOf(obj(commit.statusCheckRollup).state),
      decision:
        decision === 'APPROVED' ||
        decision === 'CHANGES_REQUESTED' ||
        decision === 'REVIEW_REQUIRED'
          ? decision
          : null,
      reviews: list(obj(pr.latestReviews).nodes).flatMap((item) => {
        const review = obj(item)
        const state = review.state
        const author = str(obj(review.author).login, 100)
        if (state !== 'APPROVED' && state !== 'CHANGES_REQUESTED' && state !== 'COMMENTED') {
          return []
        }
        return author ? [{ author, state, at: str(review.submittedAt, 40) }] : []
      })
    })
  }
  const reviewRequests: ReviewRequest[] = []
  for (const node of list(obj(data.search).nodes)) {
    const pr = obj(node)
    const url = https(pr.url)
    if (!url || typeof pr.number !== 'number') continue
    reviewRequests.push({
      repo: str(obj(pr.repository).nameWithOwner, 200),
      number: pr.number,
      title: str(pr.title),
      url,
      author: str(obj(pr.author).login, 100)
    })
  }
  return { login, at, mine, reviewRequests }
}

/**
 * O que mudou de uma leitura para a outra. Sem leitura anterior, nada: a primeira só serve de
 * base (senão tudo o que já estava lá viraria alerta).
 */
export function diffSnapshots(before: GithubSnapshot | null, after: GithubSnapshot): GithubAlert[] {
  if (!before || before.login !== after.login) return []
  const alerts: GithubAlert[] = []
  const previous = new Map(before.mine.map((pr) => [pr.url, pr]))
  for (const pr of after.mine) {
    const old = previous.get(pr.url)
    // CI: falhou (antes não tinha falhado, ou falhou de novo num commit novo) ou passou depois
    // de estar rodando ou vermelho.
    if (pr.ci === 'failure' && (old?.ci !== 'failure' || old.head !== pr.head)) {
      alerts.push({ kind: 'ci-failed', pr })
    } else if (pr.ci === 'success' && old && (old.ci === 'pending' || old.ci === 'failure')) {
      alerts.push({ kind: 'ci-passed', pr })
    }
    // Revisões novas (de outra pessoa): a mais nova de cada um, comparada pela hora.
    const seen = new Set((old?.reviews ?? []).map((r) => `${r.author}@${r.at}`))
    for (const review of pr.reviews) {
      if (review.author === after.login || seen.has(`${review.author}@${review.at}`)) continue
      alerts.push({ kind: 'review', pr, author: review.author, state: review.state })
    }
  }
  const requested = new Set(before.reviewRequests.map((r) => r.url))
  for (const request of after.reviewRequests) {
    if (!requested.has(request.url)) alerts.push({ kind: 'review-requested', request })
  }
  return alerts
}

/** O texto de um alerta: título e corpo da notificação, e o PR que o clique abre. */
export function describeAlert(alert: GithubAlert): { title: string; body: string; url: string } {
  if (alert.kind === 'review-requested') {
    const { request } = alert
    return {
      title: t('{v1} pediu a sua revisão', { v1: request.author || t('Alguém') }),
      body: `${request.repo}#${request.number}: ${request.title}`,
      url: request.url
    }
  }
  const { pr } = alert
  const where = `${pr.repo}#${pr.number}: ${pr.title}`
  switch (alert.kind) {
    case 'ci-failed':
      return { title: t('O CI falhou'), body: where, url: pr.url }
    case 'ci-passed':
      return { title: t('O CI passou'), body: where, url: pr.url }
    case 'review': {
      const what =
        alert.state === 'APPROVED'
          ? t('aprovou o seu PR')
          : alert.state === 'CHANGES_REQUESTED'
            ? t('pediu mudanças no seu PR')
            : t('comentou no seu PR')
      return { title: `${alert.author} ${what}`, body: where, url: pr.url }
    }
  }
}

/** A leitura em texto, para a ferramenta github_status (o Claude responde "como estão meus PRs?"). */
export function describeSnapshot(snapshot: GithubSnapshot): string {
  const ci: Record<CiState, string> = {
    success: t('CI passou'),
    failure: t('CI falhou'),
    pending: t('CI rodando'),
    none: t('sem CI')
  }
  const decision = {
    APPROVED: t('aprovado'),
    CHANGES_REQUESTED: t('pediram mudanças'),
    REVIEW_REQUIRED: t('esperando revisão')
  }
  const mine = snapshot.mine.map((pr) => {
    const parts = [
      ci[pr.ci],
      pr.decision ? decision[pr.decision] : null,
      pr.draft ? t('rascunho') : null
    ]
    return `- ${pr.repo}#${pr.number} "${pr.title}": ${parts.filter(Boolean).join(', ')} (${pr.url})`
  })
  const requests = snapshot.reviewRequests.map(
    (r) => `- ${r.repo}#${r.number} "${r.title}", de ${r.author || '?'} (${r.url})`
  )
  return [
    t('GitHub de {login}, lido às {v2}.', {
      login: snapshot.login,
      v2: new Date(snapshot.at).toLocaleTimeString(dateLocale(), {
        hour: '2-digit',
        minute: '2-digit'
      })
    }),
    t('Seus PRs abertos ({length}):', { length: mine.length }),
    ...(mine.length ? mine : ['- nenhum']),
    t('Pedem a sua revisão ({length}):', { length: requests.length }),
    ...(requests.length ? requests : ['- nenhum'])
  ].join('\n')
}

/** O que deu errado ao perguntar: sem o gh, sem login, ou um erro passageiro (rede). */
export type GhProblem = { kind: 'missing' | 'login' | 'failed'; message: string }

/** Roda a consulta pelo gh. O ambiente vai sem a chave da Anthropic e sem perguntas interativas. */
export function runQuery(gh: string, timeoutMs = 30_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
      GH_NO_UPDATE_NOTIFIER: '1',
      NO_COLOR: '1'
    }
    delete env.ANTHROPIC_API_KEY
    const run = viaHost(gh, ['api', 'graphql', '-f', `query=${QUERY}`], {
      env,
      unset: ['ANTHROPIC_API_KEY']
    })
    const child = spawn(run.command, run.args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (out.length < 2_000_000) out += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      err = (err + chunk).slice(-2000)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        error.code === 'ENOENT'
          ? { kind: 'missing', message: 'o gh não está instalado' }
          : { kind: 'failed', message: error.message }
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        try {
          return resolve(JSON.parse(out))
        } catch {
          return reject({ kind: 'failed', message: 'resposta ilegível do gh' })
        }
      }
      // Sem login, o gh sai com 4 e manda rodar `gh auth login`.
      const login = code === 4 || /gh auth login|authentication|401/i.test(err)
      reject({
        kind: login ? 'login' : 'failed',
        message: err.trim().split('\n').pop()?.slice(0, 200) || `o gh saiu com ${code}`
      } satisfies GhProblem)
    })
  })
}

export interface GithubWatcherOptions {
  /** O caminho do gh (null: não achei). */
  gh: () => string | null
  /** O que mudou. */
  onAlerts(alerts: GithubAlert[]): void
  /** Um problema novo (ou null: resolvido). Avisa uma vez por tipo, não a cada tentativa. */
  onProblem(problem: GhProblem | null): void
  /** Onde guardar a última leitura (os testes usam outro lugar). */
  snapshotPath?: string
  /** A consulta (os testes trocam). */
  query?: (gh: string) => Promise<unknown>
  pollMs?: number
  problemPollMs?: number
}

/** Pergunta ao GitHub de tempos em tempos e avisa o que mudou. */
export class GithubWatcher {
  private timer: NodeJS.Timeout | null = null
  private last: GithubSnapshot | null = null
  private problem: GhProblem['kind'] | null = null
  /** O último problema avisado (o gh ausente ou sem login), para avisar só uma vez e a volta. */
  private announced: 'missing' | 'login' | null = null
  private running = false
  private readonly path: string

  constructor(private readonly options: GithubWatcherOptions) {
    this.path = options.snapshotPath ?? SNAPSHOT_PATH
    this.last = this.load()
  }

  /** A leitura mais nova (null antes da primeira). */
  snapshot(): GithubSnapshot | null {
    return this.last
  }

  /** O problema de agora, se houver (para a ferramenta explicar). */
  currentProblem(): GhProblem['kind'] | null {
    return this.problem
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule(1500)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Pergunta já (ao voltar da suspensão, por exemplo). */
  refreshSoon(ms = 5000): void {
    if (this.running) this.schedule(ms)
  }

  /** Uma rodada: pergunta, compara e avisa. Devolve os alertas (para os testes). */
  async poll(): Promise<GithubAlert[]> {
    const gh = this.options.gh()
    let raw: unknown
    try {
      if (!gh) throw { kind: 'missing', message: t('o gh não está instalado') } satisfies GhProblem
      raw = await (this.options.query ?? runQuery)(gh)
    } catch (error) {
      const problem = error as GhProblem
      const kind = problem?.kind ?? 'failed'
      // Um erro de rede passa sozinho; só o gh ausente e o login viram aviso.
      if (kind !== 'failed' && this.announced !== kind) {
        this.announced = kind
        this.options.onProblem(problem)
      }
      this.problem = kind
      return []
    }
    const snapshot = parseSnapshot(raw)
    if (!snapshot) {
      this.problem = 'failed'
      return []
    }
    if (this.announced) this.options.onProblem(null)
    this.announced = null
    this.problem = null
    const alerts = diffSnapshots(this.last, snapshot)
    this.last = snapshot
    this.save(snapshot)
    if (alerts.length) this.options.onAlerts(alerts)
    return alerts
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.poll().finally(() => {
        if (!this.running) return
        const slow = this.problem === 'missing' || this.problem === 'login'
        this.schedule(
          slow ? (this.options.problemPollMs ?? PROBLEM_POLL_MS) : (this.options.pollMs ?? POLL_MS)
        )
      })
    }, ms)
  }

  private load(): GithubSnapshot | null {
    try {
      const saved = JSON.parse(readFileSync(this.path, 'utf8')) as GithubSnapshot
      if (typeof saved?.login !== 'string' || !Array.isArray(saved.mine)) return null
      if (Date.now() - saved.at > SNAPSHOT_MAX_AGE_MS) return null
      return saved
    } catch {
      return null
    }
  }

  private save(snapshot: GithubSnapshot): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
      const temp = `${this.path}.tmp`
      writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 })
      renameSync(temp, this.path)
    } catch (err) {
      console.warn('[wisp] não consegui guardar a leitura do GitHub:', err)
    }
  }
}

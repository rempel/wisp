// Os avisos de CI do GitLab (Fase 52), como os do GitHub (Fase 13), pelo glab já logado: o Wisp
// não guarda token nenhum. Os seus merge requests abertos e o pipeline do commit mais novo de
// cada um; o que mudou (falhou, ou passou depois de rodar) vira o mesmo aviso do GitHub, e o
// clique num pipeline vermelho abre a conversa com o pedido de investigar pelo glab.

import { runJson } from './github'
import type { CiState, GithubSnapshot, PullRequest } from './github'

/** Quantos merge requests, no máximo, por leitura (cada um é um pedido a mais ao GitLab). */
export const MAX_MRS = 20

/** O estado do pipeline, no vocabulário dos avisos. */
export function pipelineState(status: unknown): CiState {
  switch (status) {
    case 'success':
      return 'success'
    case 'failed':
      return 'failure'
    case 'running':
    case 'pending':
    case 'created':
    case 'preparing':
    case 'waiting_for_resource':
    case 'scheduled':
      return 'pending'
    default:
      return 'none'
  }
}

interface RawMr {
  iid?: unknown
  project_id?: unknown
  title?: unknown
  web_url?: unknown
  draft?: unknown
  sha?: unknown
  references?: { full?: unknown }
  head_pipeline?: { status?: unknown; sha?: unknown } | null
}

/** Um merge request, no formato dos PRs (o projeto vem do "grupo/projeto!12"). */
export function mrOf(raw: RawMr): PullRequest | null {
  const number = typeof raw.iid === 'number' ? raw.iid : null
  const url = typeof raw.web_url === 'string' ? raw.web_url : null
  const full = typeof raw.references?.full === 'string' ? raw.references.full : ''
  if (number === null || !url || !/^https:\/\//.test(url)) return null
  return {
    host: 'gitlab',
    repo: full.split('!')[0] || '',
    number,
    title: typeof raw.title === 'string' ? raw.title : '',
    url,
    draft: raw.draft === true,
    head:
      typeof raw.head_pipeline?.sha === 'string'
        ? raw.head_pipeline.sha
        : typeof raw.sha === 'string'
          ? raw.sha
          : '',
    ci: pipelineState(raw.head_pipeline?.status),
    decision: null,
    reviews: []
  }
}

/**
 * A leitura: quem é você e os seus merge requests abertos, cada um com o pipeline (que a lista do
 * GitLab não traz: um pedido por merge request).
 */
export async function gitlabSnapshot(
  glab: string,
  api: (path: string) => Promise<unknown> = (path) => runJson(glab, ['api', path], 'glab'),
  now = Date.now()
): Promise<GithubSnapshot> {
  const user = (await api('user')) as { username?: unknown }
  const list = await api('merge_requests?scope=created_by_me&state=opened&per_page=50')
  const mine: PullRequest[] = []
  for (const item of (Array.isArray(list) ? list : []).slice(0, MAX_MRS) as RawMr[]) {
    let detail: RawMr = item
    if (typeof item.project_id === 'number' && typeof item.iid === 'number') {
      try {
        detail = {
          ...item,
          ...((await api(`projects/${item.project_id}/merge_requests/${item.iid}`)) as RawMr)
        }
      } catch {
        // Sem o detalhe, o merge request entra sem o pipeline.
      }
    }
    const mr = mrOf(detail)
    if (mr) mine.push(mr)
  }
  return {
    login: typeof user.username === 'string' ? user.username : '',
    at: now,
    mine,
    reviewRequests: []
  }
}

/** A leitura do vigia: o retrato já vem pronto (só confere o formato). */
export const parseGitlab = (raw: unknown): GithubSnapshot | null => {
  const snapshot = raw as GithubSnapshot | null
  return snapshot &&
    typeof snapshot.login === 'string' &&
    snapshot.login &&
    Array.isArray(snapshot.mine)
    ? snapshot
    : null
}

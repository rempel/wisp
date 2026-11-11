// Revisar um PR (Fase 78): de um número ou de um endereço do GitHub, o Wisp abre uma conversa
// numa cópia do Git do projeto (Fase 43), no commit do PR, com o pedido de revisão pronto na
// caixa. O Claude lê o diff e escreve a revisão; mandar para o GitHub é um comando dele
// (`gh pr review`), que passa pelo card como qualquer outro. O Wisp só usa o seu `gh` para ler
// o PR e fazer o checkout na cópia.

import { spawn } from 'child_process'
import { viaHost } from './host'
import type { Worktrees } from './worktrees'
import { t } from '../shared/i18n'

/** O PR pedido: o número e, se veio num endereço, o repositório. */
export interface PrReference {
  number: number
  repo?: string
}

/** "123", "#123" ou "https://github.com/dono/repo/pull/123" (com ou sem o resto do endereço). */
export function prReference(text: string): PrReference | null {
  const raw = text.trim()
  const plain = /^#?(\d{1,7})$/.exec(raw)
  if (plain) return { number: Number(plain[1]) }
  const url =
    /^https?:\/\/github\.com\/([\w.-]{1,100})\/([\w.-]{1,100})\/pull\/(\d{1,7})(?:[/?#].*)?$/i.exec(
      raw
    )
  return url ? { number: Number(url[3]), repo: `${url[1]}/${url[2]}` } : null
}

/** O que o Wisp lê do PR. */
export interface PrInfo {
  number: number
  title: string
  url: string
  base: string
  author: string
}

/** A resposta do `gh pr view --json`, conferida. */
export function parsePrInfo(raw: unknown): PrInfo | null {
  const value = raw as Record<string, unknown> | null
  if (!value || typeof value.number !== 'number' || typeof value.title !== 'string') return null
  const base = typeof value.baseRefName === 'string' ? value.baseRefName : ''
  // O nome do ramo vai num comando que o Claude roda: só o que um ramo pode ter.
  if (!/^[\w./-]{1,200}$/.test(base)) return null
  const author = (value.author as { login?: unknown } | null)?.login
  return {
    number: value.number,
    title: value.title.replace(/\s+/g, ' ').slice(0, 200),
    url:
      typeof value.url === 'string' && /^https:\/\/github\.com\//.test(value.url) ? value.url : '',
    base,
    author: typeof author === 'string' ? author.slice(0, 60) : ''
  }
}

/** O pedido que vai para a caixa da conversa nova. */
export function reviewPrompt(pr: PrInfo): string {
  return (
    t('Revise o PR #{number}, "{title}"{by}.', {
      number: pr.number,
      title: pr.title,
      by: pr.author ? t(', de {author}', { author: pr.author }) : ''
    }) +
    (pr.url ? ` ${pr.url}` : '') +
    '\n\n' +
    t(
      'Esta pasta é uma cópia do repositório no commit do PR. Veja o que mudou com `git diff origin/{base}...HEAD` e leia os arquivos em volta do que precisar.',
      { base: pr.base }
    ) +
    ' ' +
    t(
      'Escreva a revisão em tópicos, do mais grave ao menos grave, com o arquivo e a linha de cada ponto. Não edite arquivos nem publique nada: no fim, pergunte se eu quero mandar a revisão pelo `gh pr review`.'
    )
  )
}

/** Roda o gh numa pasta (sem shell, sem perguntas) e devolve a saída; lança com o motivo. */
export function runGh(
  gh: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
      GH_NO_UPDATE_NOTIFIER: '1',
      NO_COLOR: '1'
    }
    delete env.ANTHROPIC_API_KEY
    const run = viaHost(gh, args, { env, cwd, unset: ['ANTHROPIC_API_KEY'] })
    const child = spawn(run.command, run.args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (out.length < 1_000_000) out += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      err = (err + chunk).slice(-1000)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        new Error(
          error.code === 'ENOENT' ? t('O gh (GitHub CLI) não está instalado.') : error.message
        )
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(out)
      const line = err.trim().split('\n').pop() ?? ''
      reject(new Error(line || t('o gh saiu com o código {code}', { code: code ?? -1 })))
    })
  })
}

/**
 * Prepara a revisão: lê o PR, cria a cópia do projeto e faz o checkout do PR nela. Devolve a
 * pasta da cópia e o pedido; lança com o motivo (e desfaz a cópia) se algo falhar.
 */
export async function preparePrReview(options: {
  gh: string
  folder: string
  worktrees: Worktrees
  reference: PrReference
}): Promise<{ dir: string; prompt: string; pr: PrInfo }> {
  const { gh, folder, worktrees, reference } = options
  const repo = reference.repo ? ['--repo', reference.repo] : []
  const number = String(reference.number)
  const viewed = await runGh(
    gh,
    ['pr', 'view', number, ...repo, '--json', 'number,title,url,baseRefName,author'],
    folder
  )
  let parsed: unknown = null
  try {
    parsed = JSON.parse(viewed)
  } catch {
    // Cai no erro de baixo.
  }
  const pr = parsePrInfo(parsed)
  if (!pr) throw new Error(t('O gh não devolveu os dados desse PR.'))
  const worktree = await worktrees.create(folder)
  try {
    await runGh(gh, ['pr', 'checkout', number, ...repo, '--detach'], worktree.dir)
  } catch (err) {
    await worktrees.discard(worktree).catch(() => undefined)
    throw err
  }
  return { dir: worktree.dir, prompt: reviewPrompt(pr), pr }
}

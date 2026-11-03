// A conversa numa cópia (Fase 43): uma worktree do Git do projeto, num ramo só dela
// (wisp/<id>), para duas tarefas no mesmo repositório não pisarem uma na outra. No fim, você junta
// (as mudanças da cópia entram na pasta original, sem commit, como se tivessem sido feitas lá) ou
// descarta (a cópia e o ramo saem). Tudo pelo git, com a lista de argumentos (nada pelo shell).
//
// A lista das cópias fica em copias.json, com a pasta, o repositório, o ramo e a base: o que já foi
// juntado (uma árvore do Git, sem commit). Juntar de novo leva só o que mudou depois.

import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { DATA_DIR } from './paths'
import { t } from '../shared/i18n'

/** Onde as cópias ficam (os dados do Wisp: não somem com o cache). */
export const WORKTREES_DIR = join(DATA_DIR, 'copias')
const REGISTRY = join(DATA_DIR, 'copias.json')

/** Uma cópia, como fica na lista. */
export interface Worktree {
  dir: string
  /** A pasta do repositório original. */
  repo: string
  branch: string
  /** O que já está na pasta original: o commit de quando a cópia nasceu, ou a árvore do último juntar. */
  base: string
  createdAt: number
}

/** Um arquivo mudado na cópia (desde a base). */
export interface WorktreeChange {
  path: string
  added: number
  removed: number
}

/** Roda o git e devolve a saída (o erro, com a mensagem do git). */
export type GitRunner = (
  args: string[],
  options?: { cwd?: string; input?: string }
) => Promise<string>

/** O git do sistema (sem shell; a entrada, quando há, pelo stdin). */
export function gitRunner(git: string): GitRunner {
  return (args, options = {}) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        git,
        args,
        {
          cwd: options.cwd,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        },
        (err, stdout, stderr) => {
          if (err) reject(new Error((stderr || err.message).trim().split('\n')[0]))
          else resolve(stdout)
        }
      )
      if (options.input !== undefined) child.stdin?.end(options.input)
    })
}

export function readWorktrees(file = REGISTRY): Worktree[] {
  try {
    const list = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return Array.isArray(list)
      ? list.filter(
          (item): item is Worktree =>
            !!item &&
            typeof item.dir === 'string' &&
            typeof item.repo === 'string' &&
            typeof item.branch === 'string' &&
            typeof item.base === 'string'
        )
      : []
  } catch {
    return []
  }
}

function saveWorktrees(list: Worktree[], file: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(list, null, 2))
}

export class Worktrees {
  constructor(
    private readonly git: GitRunner,
    private readonly root = WORKTREES_DIR,
    private readonly file = REGISTRY
  ) {}

  list(): Worktree[] {
    return readWorktrees(this.file)
  }

  /** A cópia de uma pasta (a pasta de uma conversa), se for uma. */
  byDir(dir: string | null): Worktree | null {
    return dir ? (this.list().find((item) => item.dir === dir) ?? null) : null
  }

  /** Cria a cópia de um projeto, a partir do commit de agora, num ramo novo. */
  async create(folder: string, now = Date.now()): Promise<Worktree> {
    let repo: string
    try {
      repo = (await this.git(['rev-parse', '--show-toplevel'], { cwd: folder })).trim()
    } catch {
      throw new Error(t('Essa pasta não é um repositório do Git.'))
    }
    let head: string
    try {
      head = (await this.git(['rev-parse', 'HEAD'], { cwd: repo })).trim()
    } catch {
      throw new Error(t('O repositório ainda não tem nenhum commit para copiar.'))
    }
    const id = randomBytes(3).toString('hex')
    const branch = `wisp/${id}`
    const dir = join(this.root, `${basename(repo)}-${id}`)
    mkdirSync(this.root, { recursive: true })
    await this.git(['worktree', 'add', '-b', branch, dir, head], { cwd: repo })
    const worktree: Worktree = { dir, repo, branch, base: head, createdAt: now }
    saveWorktrees([...this.list(), worktree], this.file)
    return worktree
  }

  /** O que mudou na cópia desde a base (os arquivos novos também). */
  async changes(worktree: Worktree): Promise<WorktreeChange[]> {
    await this.git(['add', '-A'], { cwd: worktree.dir })
    const out = await this.git(['diff', '--cached', '--numstat', '-z', worktree.base], {
      cwd: worktree.dir
    })
    const changes: WorktreeChange[] = []
    for (const entry of out.split('\0').filter(Boolean)) {
      const [added, removed, ...rest] = entry.split('\t')
      const path = rest.join('\t')
      if (!path) continue
      changes.push({
        path,
        added: added === '-' ? 0 : Number(added) || 0,
        removed: removed === '-' ? 0 : Number(removed) || 0
      })
    }
    return changes
  }

  /**
   * Junta: as mudanças da cópia desde a base entram na pasta original (sem commit). Antes, confere
   * que elas aplicam limpas; se não, nada muda e o ramo fica para juntar à mão.
   */
  async join(worktree: Worktree): Promise<{ files: number }> {
    await this.git(['add', '-A'], { cwd: worktree.dir })
    const patch = await this.git(['diff', '--cached', '--binary', worktree.base], {
      cwd: worktree.dir
    })
    if (!patch.trim()) return { files: 0 }
    try {
      await this.git(['apply', '--check', '--binary', '-'], { cwd: worktree.repo, input: patch })
    } catch (err) {
      throw new Error(
        t(
          'As mudanças não entram limpas na pasta original ({message}). Nada mudou lá; o ramo {branch} fica com elas, para juntar à mão.',
          { message: (err as Error).message, branch: worktree.branch }
        ),
        { cause: err }
      )
    }
    await this.git(['apply', '--binary', '-'], { cwd: worktree.repo, input: patch })
    // A base vira o que acabou de entrar: juntar de novo leva só o que mudar depois.
    const tree = (await this.git(['write-tree'], { cwd: worktree.dir })).trim()
    saveWorktrees(
      this.list().map((item) => (item.dir === worktree.dir ? { ...item, base: tree } : item)),
      this.file
    )
    return { files: patch.match(/^diff --git /gm)?.length ?? 0 }
  }

  /** Descarta: a cópia e o ramo saem (o que não foi juntado se perde). */
  async discard(worktree: Worktree): Promise<void> {
    if (existsSync(worktree.dir)) {
      await this.git(['worktree', 'remove', '--force', worktree.dir], { cwd: worktree.repo })
    } else {
      await this.git(['worktree', 'prune'], { cwd: worktree.repo }).catch(() => '')
    }
    await this.git(['branch', '-D', worktree.branch], { cwd: worktree.repo }).catch(() => '')
    saveWorktrees(
      this.list().filter((item) => item.dir !== worktree.dir),
      this.file
    )
  }

  /**
   * Ao abrir o Wisp: as cópias sem mudança e sem aba aberta saem; as com mudança ficam (e
   * aparecem no menu das pastas). As que sumiram do disco saem da lista.
   */
  async tidy(open: (dir: string) => boolean): Promise<void> {
    for (const worktree of this.list()) {
      if (open(worktree.dir)) continue
      try {
        if (!existsSync(worktree.dir) || !(await this.changes(worktree)).length) {
          await this.discard(worktree)
        }
      } catch {
        // O repositório original sumiu: fica, e o menu mostra.
      }
    }
  }
}

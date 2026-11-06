// Revisar no fim do turno (Fase 42): antes de cada edição do Claude (Edit, Write, MultiEdit,
// NotebookEdit), um hook PreToolUse guarda uma cópia do arquivo como estava antes do turno. No fim
// do turno, o Wisp compara cada cópia com o arquivo de agora e mostra um card com o que mudou, com
// desfazer por arquivo. As cópias ficam na pasta da conversa (só do usuário), uma por arquivo
// (a primeira do turno: as outras edições do mesmo arquivo não a trocam), e somem no turno
// seguinte. Este arquivo roda dentro do hook: só o fs e o crypto, nada do app.

import { createHash } from 'crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from 'fs'
import { isAbsolute, join, resolve } from 'path'

/** A pasta das cópias da conversa, que o Wisp passa ao Claude Code (e o hook lê). */
export const SNAPSHOT_ENV = 'WISP_SNAPSHOT_DIR'
/** O argumento do relay que faz o hook guardar a cópia (wisp-hook --snapshot). */
export const SNAPSHOT_ARG = '--snapshot'
/** As ferramentas que editam arquivos. */
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const
/** O matcher do hook (uma expressão do Claude Code). */
export const EDIT_MATCHER = EDIT_TOOLS.join('|')
/** Um arquivo maior que isto não ganha cópia (o card diz que não dá para desfazer). */
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
/** Quantos arquivos, no máximo, por turno. */
const MAX_FILES = 200

/** O que fica guardado de um arquivo (o .json ao lado da cópia). */
export interface SnapshotMeta {
  path: string
  /** O arquivo existia antes do turno (senão, desfazer é apagar). */
  existed: boolean
  /** Grande demais para guardar: não dá para desfazer. */
  tooBig?: boolean
}

const keyOf = (path: string): string => createHash('sha256').update(path).digest('hex').slice(0, 32)

/**
 * Guarda a cópia de um arquivo antes da primeira edição do turno. Quieto: um erro só deixa sem
 * cópia (o hook nunca atrapalha o Claude Code).
 */
export function snapshotFile(dir: string, path: string): void {
  if (!dir || !isAbsolute(dir) || !isAbsolute(path)) return
  const key = keyOf(path)
  const metaPath = join(dir, `${key}.json`)
  if (existsSync(metaPath)) return
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (readdirSync(dir).length >= MAX_FILES * 2) return
  let meta: SnapshotMeta
  try {
    const info = statSync(path)
    if (!info.isFile()) return
    if (info.size > MAX_SNAPSHOT_BYTES) meta = { path, existed: true, tooBig: true }
    else {
      writeFileSync(join(dir, `${key}.orig`), readFileSync(path), { mode: 0o600 })
      meta = { path, existed: true }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return
    meta = { path, existed: false }
  }
  // O .json por último, e só um: duas edições ao mesmo tempo não trocam a primeira cópia.
  let fd: number
  try {
    fd = openSync(metaPath, 'wx', 0o600)
  } catch {
    return
  }
  try {
    writeSync(fd, JSON.stringify(meta))
  } finally {
    closeSync(fd)
  }
}

/** O caminho que a ferramenta vai editar (relativo à pasta da sessão, se for o caso). */
export function editedPath(input: Record<string, unknown>): string | null {
  const tool = input.tool_name
  if (typeof tool !== 'string' || !(EDIT_TOOLS as readonly string[]).includes(tool)) return null
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>
  const raw = toolInput.file_path ?? toolInput.notebook_path
  if (typeof raw !== 'string' || !raw.trim()) return null
  if (isAbsolute(raw)) return raw
  const cwd = typeof input.cwd === 'string' && isAbsolute(input.cwd) ? input.cwd : null
  return cwd ? resolve(cwd, raw) : null
}

/** O hook: lê o evento da entrada, guarda a cópia e sai sem decidir nada. */
export function runSnapshotHook(stdin: string, env: NodeJS.ProcessEnv): void {
  const dir = env[SNAPSHOT_ENV]
  if (!dir) return
  try {
    const parsed: unknown = JSON.parse(stdin.replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const path = editedPath(parsed as Record<string, unknown>)
    if (path) snapshotFile(dir, path)
  } catch {
    // Sem cópia: o card não oferece desfazer esse arquivo.
  }
}

/** Uma cópia guardada, com o conteúdo de antes (null se o arquivo não existia ou era grande). */
export interface Snapshot extends SnapshotMeta {
  original: Buffer | null
}

/** As cópias do turno. */
export function readSnapshots(dir: string): Snapshot[] {
  let names: string[]
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }
  const out: Snapshot[] = []
  for (const name of names) {
    try {
      const meta = JSON.parse(readFileSync(join(dir, name), 'utf8')) as SnapshotMeta
      if (typeof meta.path !== 'string' || typeof meta.existed !== 'boolean') continue
      const orig = join(dir, name.replace(/\.json$/, '.orig'))
      const original = meta.existed && !meta.tooBig ? readFileSync(orig) : null
      out.push({ ...meta, original })
    } catch {
      // Uma cópia estragada fica de fora.
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** Começa um turno novo: as cópias do anterior saem. */
export function clearSnapshots(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * Guarda as cópias de um turno em `into` (Fase 46: voltar a um ponto da conversa). Se `into` já
 * tem cópias (o mesmo turno, retomado depois de compactar ou de editar a mensagem), as de lá
 * ficam: a mais antiga de cada arquivo é a que vale.
 */
export function archiveSnapshots(dir: string, into: string): void {
  if (!existsSync(dir)) return
  if (!existsSync(into)) {
    mkdirSync(join(into, '..'), { recursive: true, mode: 0o700 })
    try {
      renameSync(dir, into)
      return
    } catch {
      // Outro disco ou outro problema: copia arquivo por arquivo, abaixo.
    }
  }
  mkdirSync(into, { recursive: true, mode: 0o700 })
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || existsSync(join(into, name))) continue
    const orig = name.replace(/\.json$/, '.orig')
    try {
      if (existsSync(join(dir, orig)))
        writeFileSync(join(into, orig), readFileSync(join(dir, orig)), { mode: 0o600 })
      writeFileSync(join(into, name), readFileSync(join(dir, name)), { mode: 0o600 })
    } catch {
      // Uma cópia que não passou fica de fora.
    }
  }
  clearSnapshots(dir)
}

/** O conteúdo de agora (null se o arquivo não existe). */
export function currentContent(path: string): Buffer | null {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

/** A marca do conteúdo, para saber se o arquivo mudou depois do card. */
export const hashOf = (data: Buffer | null): string =>
  data === null ? 'nada' : createHash('sha256').update(data).digest('hex').slice(0, 16)

/**
 * Desfaz um arquivo: volta ao conteúdo de antes do turno (ou o apaga, se ele não existia). Só se
 * ele ainda estiver como o card mostrou (`expected`): mudado depois, fica como está.
 */
export function restoreSnapshot(
  snapshot: Snapshot,
  expected: string
): 'ok' | 'changed' | 'no-copy' {
  if (snapshot.tooBig || (snapshot.existed && snapshot.original === null)) return 'no-copy'
  if (hashOf(currentContent(snapshot.path)) !== expected) return 'changed'
  if (snapshot.existed) writeFileSync(snapshot.path, snapshot.original as Buffer)
  else unlinkSync(snapshot.path)
  return 'ok'
}

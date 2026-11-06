// Revisar no fim do turno (Fase 42): no fim de cada resposta que editou arquivos, um card com o
// que mudou em cada um (o diff do arquivo inteiro, de antes do turno até agora) e o desfazer. As
// cópias de antes vêm do hook das edições (turn-snapshot.ts); aqui o Wisp marca o começo de cada
// turno, monta o card no fim e desfaz quando pedem (só o arquivo como o card mostrou).

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readdirSync } from 'fs'
import { join } from 'path'
import { CACHE_DIR } from './paths'
import {
  archiveSnapshots,
  clearSnapshots,
  currentContent,
  hashOf,
  readSnapshots,
  restoreSnapshot
} from './turn-snapshot'
import type { Snapshot } from './turn-snapshot'
import { wholeFileDiff } from '../shared/diff'
import { IPC } from '../shared/ipc'
import type { ChatEvent, ReviewFile, ReviewUndoResult, RewindPreview } from '../shared/ipc'
import { t } from '../shared/i18n'

/** A pasta das cópias de todas as conversas (sai inteira quando o Wisp abre). */
export const SNAPSHOTS_ROOT = join(CACHE_DIR, 'revisao')
/** A pasta das cópias de uma conversa. */
export const snapshotDirOf = (conversation: string): string => join(SNAPSHOTS_ROOT, conversation)
/** A pasta das cópias dos turnos anteriores de uma conversa (Fase 46), uma por turno. */
export const turnsDirOf = (dir: string): string => `${dir}.turnos`
/** Quantos turnos de cópias ficam guardados (os mais antigos saem). */
export const MAX_TURNS = 30

/** Um arquivo binário (com um byte zero no começo) não tem diff de linhas. */
const isBinary = (data: Buffer | null): boolean => !!data && data.subarray(0, 8000).includes(0)

/** O que o card mostra de um arquivo, comparando a cópia com o de agora; null se não mudou. */
export function reviewFile(snapshot: Snapshot): ReviewFile | null {
  const now = currentContent(snapshot.path)
  if (snapshot.tooBig) {
    return {
      path: snapshot.path,
      status: 'modified',
      added: 0,
      removed: 0,
      hash: hashOf(now),
      canUndo: false
    }
  }
  const before = snapshot.existed ? snapshot.original : null
  if (hashOf(before) === hashOf(now)) return null
  const status = before === null ? 'created' : now === null ? 'deleted' : 'modified'
  const binary = isBinary(before) || isBinary(now)
  const diff = binary
    ? null
    : wholeFileDiff(before?.toString('utf8') ?? '', now?.toString('utf8') ?? '')
  return {
    path: snapshot.path,
    status,
    added: diff?.added ?? 0,
    removed: diff?.removed ?? 0,
    ...(diff ? { diff } : {}),
    hash: hashOf(now),
    canUndo: true
  }
}

export class TurnReviews {
  /** O turno de cada conversa (cresce a cada mensagem que começa um turno). */
  private readonly turns = new Map<string, number>()
  /** A conversa está entre um turno e outro (a próxima mensagem começa um turno novo). */
  private readonly idle = new Map<string, boolean>()
  /**
   * De que turno da conversa (o número da mensagem que o começou, a partir de 0) são as cópias
   * da pasta de agora (Fase 46), e o primeiro turno visto ao vivo: os de antes não têm cópias.
   */
  private readonly labels = new Map<string, number>()
  private readonly first = new Map<string, number>()

  constructor(
    private readonly dirOf: (conversation: string) => string = snapshotDirOf,
    private readonly enabled: () => boolean = () => true,
    /** Quantas mensagens começaram um turno na conversa (a do turno que começa, inclusive). */
    private readonly turnCount: (conversation: string) => number = () => 0
  ) {}

  /**
   * Um evento ao vivo de uma conversa. O Claude começando a trabalhar (busy) começa um turno e
   * guarda as cópias do anterior com o número dele (uma mensagem mandada no meio da resposta
   * não muda o busy); o fim do turno devolve o card.
   */
  onEvent(conversation: string, event: ChatEvent): ChatEvent | null {
    if (event.type === 'busy') {
      if (event.busy && this.idle.get(conversation) !== false) this.startTurn(conversation)
      return null
    }
    if (event.type === 'reset') {
      this.clear(conversation)
      this.idle.set(conversation, true)
      return null
    }
    if (event.type === 'rewind') {
      this.rewound(conversation, event.keep ?? this.labels.get(conversation) ?? 0)
      return null
    }
    if (event.type !== 'turn-end') return null
    this.idle.set(conversation, true)
    if (!this.enabled()) return null
    const files = readSnapshots(this.dirOf(conversation))
      .map(reviewFile)
      .filter((file): file is ReviewFile => file !== null)
    if (!files.length) return null
    return { type: 'turn-review', turn: this.turns.get(conversation) ?? 0, files }
  }

  /** Desfaz um arquivo do card (ou todos, com `path` null), se o card ainda for o do último turno. */
  undo(
    conversation: string,
    turn: number,
    files: { path: string; hash: string }[]
  ): ReviewUndoResult {
    if (turn !== this.turns.get(conversation) || this.idle.get(conversation) === false) {
      return {
        undone: [],
        problems: [t('Essa resposta já passou: as cópias de antes dela não existem mais.')]
      }
    }
    const snapshots = new Map(
      readSnapshots(this.dirOf(conversation)).map((snapshot) => [snapshot.path, snapshot])
    )
    return this.restoreFrom(snapshots, files)
  }

  /** A conversa fechou: as cópias dela saem. */
  forget(conversation: string): void {
    this.clear(conversation)
    this.turns.delete(conversation)
    this.idle.delete(conversation)
  }

  /**
   * O que voltar ao turno `keep` (Fase 46) faria nos arquivos: cada arquivo que as respostas dali
   * em diante editaram volta à cópia mais antiga dele. `partial`: parte desses turnos é de antes
   * de o Wisp abrir (ou de a conversa voltar do histórico), sem cópias.
   */
  preview(conversation: string, keep: number): Omit<RewindPreview, 'ok' | 'message'> {
    const first = this.first.get(conversation)
    const partial = first === undefined || first > keep
    const files = [...this.since(conversation, keep).values()]
      .map(reviewFile)
      .filter((file): file is ReviewFile => file !== null)
      .sort((a, b) => a.path.localeCompare(b.path))
    return { files, partial }
  }

  /** Volta os arquivos ao que eram antes do turno `keep` (só os que estão como a prévia mostrou). */
  restore(
    conversation: string,
    keep: number,
    files: { path: string; hash: string }[]
  ): ReviewUndoResult {
    return this.restoreFrom(this.since(conversation, keep), files)
  }

  /** A conversa voltou para antes do turno `keep`: as cópias desse turno em diante saem. */
  rewound(conversation: string, keep: number): void {
    clearSnapshots(this.dirOf(conversation))
    const turnsDir = turnsDirOf(this.dirOf(conversation))
    for (const label of this.archived(conversation)) {
      if (label >= keep) clearSnapshots(join(turnsDir, String(label)))
    }
    this.labels.delete(conversation)
    const first = this.first.get(conversation)
    if (first !== undefined) this.first.set(conversation, Math.min(first, keep))
    this.idle.set(conversation, true)
  }

  private startTurn(conversation: string): void {
    const dir = this.dirOf(conversation)
    const turnsDir = turnsDirOf(dir)
    const previous = this.labels.get(conversation)
    if (previous !== undefined) archiveSnapshots(dir, join(turnsDir, String(previous)))
    else clearSnapshots(dir)
    const label = Math.max(0, this.turnCount(conversation) - 1)
    this.labels.set(conversation, label)
    if (!this.first.has(conversation)) this.first.set(conversation, label)
    for (const old of this.archived(conversation)) {
      if (old <= label - MAX_TURNS) {
        clearSnapshots(join(turnsDir, String(old)))
        this.first.set(conversation, Math.max(this.first.get(conversation) ?? 0, old + 1))
      }
    }
    this.turns.set(conversation, (this.turns.get(conversation) ?? 0) + 1)
    this.idle.set(conversation, false)
  }

  /** Os turnos com as cópias guardadas, em ordem. */
  private archived(conversation: string): number[] {
    try {
      return readdirSync(turnsDirOf(this.dirOf(conversation)))
        .filter((name) => /^\d+$/.test(name))
        .map(Number)
        .sort((a, b) => a - b)
    } catch {
      return []
    }
  }

  /** A cópia mais antiga de cada arquivo, do turno `keep` até agora. */
  private since(conversation: string, keep: number): Map<string, Snapshot> {
    const dirs = this.archived(conversation)
      .filter((label) => label >= keep)
      .map((label) => join(turnsDirOf(this.dirOf(conversation)), String(label)))
    dirs.push(this.dirOf(conversation))
    const out = new Map<string, Snapshot>()
    for (const dir of dirs) {
      for (const snapshot of readSnapshots(dir)) {
        if (!out.has(snapshot.path)) out.set(snapshot.path, snapshot)
      }
    }
    return out
  }

  private clear(conversation: string): void {
    const dir = this.dirOf(conversation)
    clearSnapshots(dir)
    clearSnapshots(turnsDirOf(dir))
    this.labels.delete(conversation)
    this.first.delete(conversation)
  }

  private restoreFrom(
    snapshots: Map<string, Snapshot>,
    files: { path: string; hash: string }[]
  ): ReviewUndoResult {
    const undone: string[] = []
    const problems: string[] = []
    for (const { path, hash } of files) {
      const snapshot = snapshots.get(path)
      let result: ReturnType<typeof restoreSnapshot> = 'no-copy'
      try {
        if (snapshot) result = restoreSnapshot(snapshot, hash)
      } catch (err) {
        problems.push(
          t('Não consegui desfazer {path}: {message}', { path, message: (err as Error).message })
        )
        continue
      }
      if (result === 'ok') undone.push(path)
      else if (result === 'changed')
        problems.push(t('{path} mudou depois da resposta: ficou como está.', { path }))
      else problems.push(t('Não há a cópia de antes de {path}.', { path }))
    }
    return { undone, problems }
  }
}

/**
 * As revisões do painel: a pasta das cópias de uma execução anterior sai (as conversas de antes
 * não voltam com elas), e o desfazer chega pelo IPC.
 */
export function setupTurnReviews(
  fromChat: (event: IpcMainInvokeEvent) => boolean,
  enabled: () => boolean,
  turnCount: (conversation: string) => number
): TurnReviews {
  clearSnapshots(SNAPSHOTS_ROOT)
  const reviews = new TurnReviews(snapshotDirOf, enabled, turnCount)
  ipcMain.handle(
    IPC.chatReviewUndo,
    (event, conversation: unknown, turn: unknown, files: unknown): ReviewUndoResult => {
      const valid =
        fromChat(event) &&
        typeof conversation === 'string' &&
        typeof turn === 'number' &&
        Array.isArray(files) &&
        files.every(
          (file) => file && typeof file.path === 'string' && typeof file.hash === 'string'
        )
      if (!valid) return { undone: [], problems: [t('pedido inválido')] }
      return reviews.undo(conversation, turn, files as { path: string; hash: string }[])
    }
  )
  return reviews
}

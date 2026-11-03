// Revisar no fim do turno (Fase 42): no fim de cada resposta que editou arquivos, um card com o
// que mudou em cada um (o diff do arquivo inteiro, de antes do turno até agora) e o desfazer. As
// cópias de antes vêm do hook das edições (turn-snapshot.ts); aqui o Wisp marca o começo de cada
// turno, monta o card no fim e desfaz quando pedem (só o arquivo como o card mostrou).

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { CACHE_DIR } from './paths'
import {
  clearSnapshots,
  currentContent,
  hashOf,
  readSnapshots,
  restoreSnapshot
} from './turn-snapshot'
import type { Snapshot } from './turn-snapshot'
import { wholeFileDiff } from '../shared/diff'
import { IPC } from '../shared/ipc'
import type { ChatEvent, ReviewFile, ReviewUndoResult } from '../shared/ipc'
import { t } from '../shared/i18n'

/** A pasta das cópias de todas as conversas (sai inteira quando o Wisp abre). */
export const SNAPSHOTS_ROOT = join(CACHE_DIR, 'revisao')
/** A pasta das cópias de uma conversa. */
export const snapshotDirOf = (conversation: string): string => join(SNAPSHOTS_ROOT, conversation)

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

  constructor(
    private readonly dirOf: (conversation: string) => string = snapshotDirOf,
    private readonly enabled: () => boolean = () => true
  ) {}

  /**
   * Um evento ao vivo de uma conversa. O Claude começando a trabalhar (busy) começa um turno e
   * apaga as cópias do anterior (uma mensagem mandada no meio da resposta não muda o busy); o fim
   * do turno devolve o card.
   */
  onEvent(conversation: string, event: ChatEvent): ChatEvent | null {
    if (event.type === 'busy') {
      if (event.busy && this.idle.get(conversation) !== false) {
        clearSnapshots(this.dirOf(conversation))
        this.turns.set(conversation, (this.turns.get(conversation) ?? 0) + 1)
        this.idle.set(conversation, false)
      }
      return null
    }
    if (event.type === 'reset' || event.type === 'rewind') {
      clearSnapshots(this.dirOf(conversation))
      this.idle.set(conversation, true)
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

  /** A conversa fechou: as cópias dela saem. */
  forget(conversation: string): void {
    clearSnapshots(this.dirOf(conversation))
    this.turns.delete(conversation)
    this.idle.delete(conversation)
  }
}

/**
 * As revisões do painel: a pasta das cópias de uma execução anterior sai (as conversas de antes
 * não voltam com elas), e o desfazer chega pelo IPC.
 */
export function setupTurnReviews(
  fromChat: (event: IpcMainInvokeEvent) => boolean,
  enabled: () => boolean
): TurnReviews {
  clearSnapshots(SNAPSHOTS_ROOT)
  const reviews = new TurnReviews(snapshotDirOf, enabled)
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

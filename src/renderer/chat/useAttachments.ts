import { useCallback, useEffect, useRef, useState } from 'react'
import { ATTACHMENT_LIMITS } from '../../shared/ipc'
import type { AttachmentPreview } from './state'

/** Um anexo ainda na caixa de texto, esperando o envio. */
export interface PendingAttachment extends AttachmentPreview {
  id: string
  /** Caminho do arquivo original; o main copia na hora de enviar. */
  path: string
}

/** Lado da miniatura em px (o dobro do tamanho na tela, para telas HiDPI). */
const THUMB_PX = 128
const ERROR_MS = 6000
const MAX_MB = ATTACHMENT_LIMITS.maxBytes / 1024 / 1024

const sizeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${sizeFormat.format(bytes / 1024 / 1024)} MB`
}

/**
 * Miniatura quadrada (corte central) num data URL pequeno. Sem object URLs: o CSP do chat só
 * aceita imagens data:. Formatos que o Chromium não decodifica (HEIC, TIFF, SVG) viram chip.
 */
async function makeThumbnail(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.max(1, Math.min(THUMB_PX, side))
    canvas
      .getContext('2d')
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height
      )
    bitmap.close()
    return canvas.toDataURL('image/webp', 0.85)
  } catch {
    return undefined
  }
}

function pathOf(file: File): string {
  try {
    return window.wisp.chat.pathForFile(file)
  } catch {
    return ''
  }
}

export interface Attachments {
  pending: PendingAttachment[]
  /** Por que algo não foi anexado (some sozinho depois de alguns segundos). */
  error: string | null
  add(files: File[], problems?: string[]): Promise<void>
  /** Anexa o que veio num arraste: arquivos sim, pastas não. */
  addDropped(data: DataTransfer): void
  remove(id: string): void
  clear(): void
}

/** Os anexos da caixa de texto: confere os limites, gera as miniaturas e guarda os caminhos. */
export function useAttachments(): Attachments {
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  // A lista atual sem esperar o render, para conferir o limite quando chegam vários de uma vez.
  const current = useRef<PendingAttachment[]>([])
  const nextId = useRef(0)

  const update = useCallback((next: PendingAttachment[]): void => {
    current.current = next
    setPending(next)
  }, [])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), ERROR_MS)
    return () => clearTimeout(timer)
  }, [error])

  const add = useCallback(
    async (files: File[], problems: string[] = []): Promise<void> => {
      const accepted: { file: File; path: string }[] = []
      for (const file of files) {
        const path = pathOf(file)
        if (!path) problems.push(`"${file.name}" não veio de uma pasta do computador.`)
        else if (file.size > ATTACHMENT_LIMITS.maxBytes)
          problems.push(`"${file.name}" passa de ${MAX_MB} MB.`)
        else if (![...current.current, ...accepted].some((item) => item.path === path))
          accepted.push({ file, path })
      }
      const previews = await Promise.all(
        accepted.map(async ({ file, path }) => ({
          id: `anexo-${nextId.current++}`,
          path,
          name: file.name,
          size: file.size,
          thumbnail: await makeThumbnail(file)
        }))
      )
      const room = ATTACHMENT_LIMITS.maxFiles - current.current.length
      if (previews.length > room) {
        problems.push(`Dá para mandar até ${ATTACHMENT_LIMITS.maxFiles} anexos por mensagem.`)
      }
      update([...current.current, ...previews.slice(0, Math.max(0, room))])
      setError(problems.length ? problems.join(' ') : null)
    },
    [update]
  )

  const addDropped = useCallback(
    (data: DataTransfer): void => {
      const files: File[] = []
      const problems: string[] = []
      // Os itens só podem ser lidos durante o evento de soltar.
      for (const item of Array.from(data.items)) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (item.webkitGetAsEntry()?.isDirectory) {
          problems.push(`"${file?.name ?? 'pasta'}" é uma pasta: anexe os arquivos dela.`)
        } else if (file) {
          files.push(file)
        }
      }
      void add(files, problems)
    },
    [add]
  )

  const remove = useCallback(
    (id: string): void => update(current.current.filter((item) => item.id !== id)),
    [update]
  )
  const clear = useCallback((): void => update([]), [update])

  return { pending, error, add, addDropped, remove, clear }
}

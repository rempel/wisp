import { clipboard, nativeImage } from 'electron'
import { createHash } from 'crypto'
import type { ClipboardOffer, ClipboardUse } from '../shared/ipc'
import { saveIncoming } from './attachments'
import { thumbnailOf } from './screenshot'
import { t } from '../shared/i18n'

// O chip "usar o que você copiou" do painel. O Wisp olha a área de transferência só quando o
// painel ganha o foco, guarda só o que precisa para oferecer, e nada sai do computador até o
// usuário clicar no chip.

/** Até este tamanho o texto entra na caixa de texto; maior, vira um anexo .txt. */
const INLINE_CHARS = 4000
const INLINE_LINES = 60
/** Maior que isso nem é oferecido. */
const MAX_TEXT_CHARS = 2_000_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
/** Gerenciadores de senha (KeePassXC, o do KDE) marcam assim o que é segredo. */
const SECRET = 'electron application/osclipboard;format="x-kde-passwordManagerHint"'
/** Quantos conteúdos já usados ou dispensados ficam lembrados (para não oferecer de novo). */
const SEEN_LIMIT = 50
const LINK = /^https?:\/\/\S+$/i

interface Content {
  hash: string
  offer: ClipboardOffer
  text?: string
  png?: Buffer
}

const digest = (kind: string, data: string | Buffer): string =>
  createHash('sha256').update(kind).update(data).digest('hex')

/** Largura e altura do cabeçalho de um PNG (sem decodificar a imagem). */
function pngSize(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/** O que há na área de transferência, ou null se não há nada a oferecer. */
async function read(): Promise<Content | null> {
  const [item] = await clipboard.read()
  const types = item?.types ?? []
  if (!item || types.includes(SECRET)) return null

  const imageType = types.includes('image/png')
    ? 'image/png'
    : types.find((type) => type.startsWith('image/'))
  if (imageType) {
    const blob = (await item.getType(imageType)) as Blob
    const bytes = Buffer.from(await blob.arrayBuffer())
    const png = imageType === 'image/png' ? bytes : nativeImage.createFromBuffer(bytes).toPNG()
    const size = pngSize(png)
    if (!size || png.length > MAX_IMAGE_BYTES) return null
    const hash = digest('image', png)
    return { hash, png, offer: { id: hash.slice(0, 16), kind: 'image', ...size } }
  }

  if (!types.includes('text/plain')) return null
  const text = await clipboard.readText()
  if (!text.trim() || text.length > MAX_TEXT_CHARS) return null
  const hash = digest('text', text)
  const id = hash.slice(0, 16)
  const trimmed = text.trim()
  if (LINK.test(trimmed) && trimmed.length <= 2000) {
    try {
      return { hash, text: trimmed, offer: { id, kind: 'link', host: new URL(trimmed).host } }
    } catch {
      // Não é um link de verdade: vale como texto.
    }
  }
  const lines = text.split('\n').length
  return {
    hash,
    text,
    offer: {
      id,
      kind: 'text',
      chars: text.length,
      lines,
      ...(text.length > INLINE_CHARS || lines > INLINE_LINES ? { asFile: true } : {})
    }
  }
}

export class ClipboardChip {
  /** Conteúdos já usados, dispensados ou copiados do próprio painel. */
  private readonly seen: string[] = []
  private current: Content | null = null
  private checking: Promise<ClipboardOffer | null> | null = null

  /** O que oferecer agora; null se não há nada novo. */
  check(): Promise<ClipboardOffer | null> {
    this.checking ??= read()
      .catch(() => null)
      .then((content) => {
        this.current = content && !this.seen.includes(content.hash) ? content : null
        return this.current?.offer ?? null
      })
      .finally(() => {
        this.checking = null
      })
    return this.checking
  }

  /** O usuário clicou no chip: o texto para a caixa, ou o anexo já gravado. */
  async use(id: string): Promise<ClipboardUse> {
    const content = this.current
    if (!content || content.offer.id !== id) {
      return { error: t('O que estava copiado mudou. Copie de novo.') }
    }
    this.forget(content)
    try {
      if (content.png) {
        const saved = await saveIncoming(content.png, 'imagem-copiada', 'png')
        const thumbnail = thumbnailOf(nativeImage.createFromBuffer(content.png))
        return { attachment: { ...saved, ...(thumbnail ? { thumbnail } : {}) } }
      }
      const text = content.text ?? ''
      if (content.offer.asFile) {
        return { attachment: await saveIncoming(Buffer.from(text, 'utf8'), 'texto-copiado', 'txt') }
      }
      return { text }
    } catch (err) {
      return {
        error: t('Não consegui usar o que foi copiado: {message}.', {
          message: (err as Error).message
        })
      }
    }
  }

  /** O × do chip: este conteúdo não é oferecido de novo. */
  dismiss(id: string): void {
    if (this.current?.offer.id === id) this.forget(this.current)
  }

  /** O usuário copiou algo do próprio painel (uma resposta, um código): não é para oferecer. */
  async markCopied(): Promise<void> {
    const content = await read().catch(() => null)
    if (content) this.forget(content)
  }

  private forget(content: Content): void {
    if (!this.seen.includes(content.hash)) this.seen.push(content.hash)
    if (this.seen.length > SEEN_LIMIT) this.seen.shift()
    if (this.current?.hash === content.hash) this.current = null
  }
}

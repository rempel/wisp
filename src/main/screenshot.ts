import { desktopCapturer, nativeImage, screen } from 'electron'
import type { DesktopCapturerSource, NativeImage } from 'electron'
import { readFile, stat, unlink } from 'fs/promises'
import { fileURLToPath } from 'url'
import { options, portalBus, portalRequest, portalVersion, token } from './portal'
import { t } from '../shared/i18n'

// O print da tela: pelo portal de captura no Wayland (o sistema pede permissão na primeira vez)
// e pelo próprio Electron no X11, onde qualquer app pode ler a tela.

const SCREENSHOT = 'org.freedesktop.portal.Screenshot'
/** Quanto esperar pela resposta do portal (inclui o tempo de o usuário ler o diálogo). */
const PORTAL_TIMEOUT_MS = 2 * 60_000
/** O print que vai para o Claude: o lado maior e o total de pixels (o que a visão aproveita). */
const MODEL_MAX_SIDE = 1568
const MODEL_MAX_PIXELS = 1_200_000
/** A miniatura que aparece na conversa. */
const THUMB_WIDTH = 360
const MAX_THUMBNAIL = 100_000

/** Um print: uma imagem por tela, com o nome quando há mais de uma. */
export interface ScreenImage {
  image: NativeImage
  /** "tela 1 de 2", quando há mais de uma. */
  label?: string
  /** A tela de onde veio (o id do Electron), quando se sabe (no Wayland, o portal não diz). */
  displayId?: number
}

/** Por que o print não saiu, em português, para o chat e para o Claude. */
export class CaptureError extends Error {}

export function isWaylandSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XDG_SESSION_TYPE === 'wayland'
}

/** Tira o print de todas as telas. Lança CaptureError com o motivo. */
export async function captureScreens(wayland = isWaylandSession()): Promise<ScreenImage[]> {
  return wayland ? [await viaPortal()] : await viaElectron()
}

/** No X11: o capturador do Chromium, uma imagem por tela, da esquerda para a direita. */
async function viaElectron(): Promise<ScreenImage[]> {
  const displays = screen.getAllDisplays()
  const size = { width: 1, height: 1 }
  for (const display of displays) {
    size.width = Math.max(size.width, Math.round(display.size.width * display.scaleFactor))
    size.height = Math.max(size.height, Math.round(display.size.height * display.scaleFactor))
  }
  let sources: DesktopCapturerSource[]
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: size,
      fetchWindowIcons: false
    })
  } catch (err) {
    throw new CaptureError(
      t('não consegui ler a tela ({message})', { message: (err as Error).message })
    )
  }
  const position = (source: DesktopCapturerSource): number[] => {
    const display = displays.find((d) => String(d.id) === source.display_id)
    return display ? [display.bounds.x, display.bounds.y] : [Infinity, Infinity]
  }
  const shots = sources
    .filter((source) => !source.thumbnail.isEmpty())
    .sort((a, b) => {
      const [ax, ay] = position(a)
      const [bx, by] = position(b)
      return ax - bx || ay - by
    })
  if (!shots.length) throw new CaptureError(t('não consegui ler a tela'))
  return shots.map((source, index) => ({
    image: source.thumbnail,
    ...(source.display_id ? { displayId: Number(source.display_id) } : {}),
    ...(shots.length > 1
      ? { label: t('tela {v1} de {length}', { v1: index + 1, length: shots.length }) }
      : {})
  }))
}

/**
 * No Wayland: o portal de captura (xdg-desktop-portal). Na primeira vez, o GNOME e o KDE
 * perguntam se o Wisp pode tirar prints; a resposta fica guardada nas permissões do sistema.
 */
async function viaPortal(): Promise<ScreenImage> {
  const bus = await portalBus()
  if (!bus) throw new CaptureError(t('sem acesso ao D-Bus da sessão'))
  if ((await portalVersion(bus, SCREENSHOT)) === null) {
    throw new CaptureError(t('este desktop não tem o portal de captura de tela'))
  }
  const started = Date.now()
  const handleToken = token()
  const { response, results } = await portalRequest(
    bus,
    {
      interface: SCREENSHOT,
      member: 'Screenshot',
      signature: 'sa{sv}',
      body: ['', options({ handle_token: handleToken, modal: true, interactive: false })]
    },
    handleToken,
    PORTAL_TIMEOUT_MS
  )
  if (response === 1) throw new CaptureError(t('o print foi cancelado'))
  const uri = typeof results.uri === 'string' ? results.uri : ''
  if (response !== 0 || !uri.startsWith('file://')) {
    throw new CaptureError(
      t('o sistema não deixou tirar o print. Se a permissão foi negada antes, o desktop lembra ') +
        t('dela: veja no README como liberar de novo')
    )
  }
  const path = fileURLToPath(uri)
  let data: Buffer
  try {
    data = await readFile(path)
  } catch (err) {
    throw new CaptureError(
      t('não consegui ler o print ({message})', { message: (err as Error).message })
    )
  }
  // O portal grava o print num arquivo (o GNOME, na pasta de imagens). Ele foi pedido só para a
  // conversa, então sai de lá; só se foi criado agora, para nunca apagar outro arquivo.
  try {
    const info = await stat(path)
    if (info.isFile() && info.mtimeMs >= started - 2000) await unlink(path)
  } catch {
    // Fica onde está.
  }
  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new CaptureError(t('o print veio num formato que não sei ler'))
  return { image }
}

/** Reduz para o que a visão do Claude aproveita, mantendo a proporção. */
function fit(image: NativeImage, maxSide: number, maxPixels: number): NativeImage {
  const { width, height } = image.getSize()
  const scale = Math.min(
    1,
    maxSide / Math.max(width, height),
    Math.sqrt(maxPixels / (width * height))
  )
  if (scale >= 1) return image
  return image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: 'best'
  })
}

export interface EncodedImage {
  /** Base64. */
  data: string
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

/**
 * O print como vai para o Claude: reduzido e em PNG (sem perdas, bom para texto), ou em JPEG
 * quando o PNG fica pesado demais (fotos, degradês).
 */
export function encodeForModel(image: NativeImage): EncodedImage {
  const fitted = fit(image, MODEL_MAX_SIDE, MODEL_MAX_PIXELS)
  const png = fitted.toPNG()
  const jpeg = fitted.toJPEG(85)
  const usePng = png.length <= jpeg.length * 1.5
  return {
    data: (usePng ? png : jpeg).toString('base64'),
    mimeType: usePng ? 'image/png' : 'image/jpeg',
    ...fitted.getSize()
  }
}

/** Uma miniatura (data URL JPEG) para a conversa mostrar o que o Claude viu. */
export function thumbnailOf(image: NativeImage): string | undefined {
  const { width } = image.getSize()
  if (!width) return undefined
  const small = width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH, quality: 'good' }) : image
  for (const quality of [75, 55, 35]) {
    const url = `data:image/jpeg;base64,${small.toJPEG(quality).toString('base64')}`
    if (url.length <= MAX_THUMBNAIL) return url
  }
  return undefined
}

/** A miniatura de uma imagem que chegou em base64 (o resultado de uma ferramenta). */
export function thumbnailOfBase64(data: string): string | undefined {
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
    return image.isEmpty() ? undefined : thumbnailOf(image)
  } catch {
    return undefined
  }
}

// A música na ilha (Fase 37): o player em foco, como a ilha mostra (a capa, a barra de progresso,
// o aleatório e o repetir), a partir do MPRIS no Linux ou do controle de mídia do Windows. A capa
// vira um data URL aqui: a página do mascote não carrega nada de fora.

import { readFile, stat } from 'fs/promises'
import { extname } from 'path'
import { fileURLToPath } from 'url'
import type { IslandMusic, IslandRepeat } from '../shared/ipc'

/** Uma capa maior que isto fica de fora (bytes). */
export const MAX_COVER = 1_500_000
const COVER_TIMEOUT_MS = 5000

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

const num = (value: unknown): number | undefined => {
  if (typeof value === 'bigint') return Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/** O LoopStatus do MPRIS como a ilha mostra, e de volta. */
export function repeatOf(loop: unknown): IslandRepeat | null {
  if (loop === 'Track') return 'track'
  if (loop === 'Playlist') return 'list'
  return loop === 'None' ? 'none' : null
}

export const LOOP_STATUS: Record<IslandRepeat, string> = {
  none: 'None',
  track: 'Track',
  list: 'Playlist'
}

/**
 * O player do MPRIS como a ilha mostra. `player` são as propriedades de
 * org.mpris.MediaPlayer2.Player (GetAll, sem os Variant); `name`, o nome do app.
 */
export function mprisMusic(
  id: string,
  name: string,
  player: Record<string, unknown>,
  now = Date.now()
): IslandMusic {
  const metadata = (player.Metadata ?? {}) as Record<string, unknown>
  const artist = metadata['xesam:artist']
  const status = String(player.PlaybackStatus ?? 'Stopped')
  const length = num(metadata['mpris:length'])
  const position = num(player.Position)
  const canControl = player.CanControl !== false
  return {
    id,
    app: name,
    status: status === 'Playing' ? 'Playing' : status === 'Paused' ? 'Paused' : 'Stopped',
    ...(text(metadata['xesam:title']) ? { title: text(metadata['xesam:title']) } : {}),
    ...(Array.isArray(artist) && artist.length
      ? { artist: artist.filter((item) => typeof item === 'string').join(', ') }
      : {}),
    ...(text(metadata['xesam:album']) ? { album: text(metadata['xesam:album']) } : {}),
    // O MPRIS conta em microssegundos.
    ...(length !== undefined && length > 0 ? { durationMs: Math.round(length / 1000) } : {}),
    ...(position !== undefined && position >= 0 ? { positionMs: Math.round(position / 1000) } : {}),
    at: now,
    canControl,
    canSeek: canControl && player.CanSeek === true && length !== undefined && length > 0,
    canNext: canControl && player.CanGoNext !== false,
    canPrevious: canControl && player.CanGoPrevious !== false,
    shuffle: typeof player.Shuffle === 'boolean' ? player.Shuffle : null,
    repeat: repeatOf(player.LoopStatus),
    volume: num(player.Volume) !== undefined ? Math.min(1, Math.max(0, num(player.Volume)!)) : null,
    volumeOf: 'player'
  }
}

/** A capa que o player informa (mpris:artUrl), para virar data URL. */
export function artUrlOf(player: Record<string, unknown>): string | null {
  const metadata = (player.Metadata ?? {}) as Record<string, unknown>
  return text(metadata['mpris:artUrl']) ?? null
}

/** O id da faixa (mpris:trackid), que o SetPosition pede. */
export function trackIdOf(player: Record<string, unknown>): string | null {
  const metadata = (player.Metadata ?? {}) as Record<string, unknown>
  return text(metadata['mpris:trackid']) ?? null
}

/**
 * A capa como data URL: um arquivo local (file://), uma que já é data URL, ou (com `remote`) uma
 * da internet (https). null quando não dá, não é imagem ou é grande demais.
 */
export async function coverData(
  url: string,
  remote: boolean,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  try {
    if (url.startsWith('data:image/')) return url.length <= MAX_COVER * 1.4 ? url : null
    if (url.startsWith('file://')) {
      const path = fileURLToPath(url)
      const type = IMAGE_TYPES[extname(path).toLowerCase()]
      const info = await stat(path)
      if (!type || !info.isFile() || info.size > MAX_COVER) return null
      return `data:${type};base64,${(await readFile(path)).toString('base64')}`
    }
    if (!remote || !url.startsWith('https://')) return null
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
      redirect: 'follow'
    })
    const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!response.ok || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(type)) return null
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_COVER) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_COVER) return null
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/** Guarda a última capa (a mesma faixa não lê a capa de novo). */
export class CoverCache {
  private url: string | null = null
  private data: Promise<string | null> = Promise.resolve(null)

  constructor(private readonly load: (url: string) => Promise<string | null>) {}

  get(url: string | null): Promise<string | null> {
    if (!url) return Promise.resolve(null)
    if (url !== this.url) {
      this.url = url
      this.data = this.load(url)
    }
    return this.data
  }
}

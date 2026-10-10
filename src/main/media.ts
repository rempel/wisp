import { EventEmitter } from 'events'
import { DBusConnection, plain, Variant } from './dbus'
import type { Signal } from './dbus'

// Os players de música e vídeo, pelo MPRIS (D-Bus): o que está tocando, tocar, pausar, pular e
// volume. Funciona com Spotify, Firefox, Chrome, VLC e qualquer player que fale MPRIS, sem chave
// de API.

const PREFIX = 'org.mpris.MediaPlayer2.'
const PATH = '/org/mpris/MediaPlayer2'
const ROOT = 'org.mpris.MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'
const CALL_TIMEOUT_MS = 3000

export interface PlayerInfo {
  /** O nome no barramento (org.mpris.MediaPlayer2.spotify). */
  bus: string
  /** O nome do app ("Spotify"). */
  name: string
  /** Playing, Paused ou Stopped. */
  status: string
  title?: string
  artist?: string
  album?: string
  /** De 0 a 1, quando o player informa. */
  volume?: number
  canControl: boolean
}

export type MediaAction = 'tocar' | 'pausar' | 'alternar' | 'parar' | 'proxima' | 'anterior'

const METHODS: Record<MediaAction, string> = {
  tocar: 'Play',
  pausar: 'Pause',
  alternar: 'PlayPause',
  parar: 'Stop',
  proxima: 'Next',
  anterior: 'Previous'
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Uma descrição curta do que toca: "“Song” de Artist". */
export function describeTrack(player: PlayerInfo): string {
  if (!player.title) return ''
  return player.artist ? `“${player.title}” de ${player.artist}` : `“${player.title}”`
}

/**
 * Os players abertos. Acompanha quem está tocando (para o mascote dançar) pelos sinais do
 * barramento, sem perguntar de tempos em tempos.
 */
export class Media extends EventEmitter {
  /** Nome único (":1.42") → nome do player (org.mpris.MediaPlayer2.spotify). */
  private readonly owners = new Map<string, string>()
  /** Nome do player → PlaybackStatus. */
  private readonly statuses = new Map<string, string>()
  /** O último player que começou a tocar: o "player atual" quando nenhum está tocando. */
  private lastActive: string | null = null
  private wasPlaying = false

  private constructor(private readonly bus: DBusConnection) {
    super()
  }

  /** Conecta no barramento de sessão e começa a acompanhar os players; null sem D-Bus. */
  static async connect(): Promise<Media | null> {
    const bus = await DBusConnection.session()
    if (!bus) return null
    const media = new Media(bus)
    await media.watch()
    return media
  }

  /** Algum player está tocando. */
  get playing(): boolean {
    return [...this.statuses.values()].includes('Playing')
  }

  dispose(): void {
    this.bus.close()
  }

  /** Os players abertos, com o que cada um está tocando. */
  async players(): Promise<PlayerInfo[]> {
    const names = await this.playerNames()
    const players = await Promise.all(names.map((name) => this.info(name)))
    return players.filter((player): player is PlayerInfo => player !== null)
  }

  /** Toca, pausa, pula… Sem `target`, escolhe o player que faz sentido. Devolve o que fez. */
  async control(action: MediaAction, target?: string): Promise<string> {
    const players = await this.players()
    const chosen = this.choose(players, action, target)
    if (typeof chosen === 'string') return chosen
    for (const player of chosen) {
      await this.bus.call({
        destination: player.bus,
        path: PATH,
        interface: PLAYER,
        member: METHODS[action],
        timeout: CALL_TIMEOUT_MS
      })
    }
    // O player leva um instante para mudar de faixa ou de estado.
    await new Promise((resolve) => setTimeout(resolve, 400))
    const after = await Promise.all(chosen.map((player) => this.info(player.bus)))
    return after
      .filter((player): player is PlayerInfo => player !== null)
      .map((player) => {
        const track = describeTrack(player)
        const state =
          player.status === 'Playing'
            ? 'tocando'
            : player.status === 'Paused'
              ? 'pausado'
              : 'parado'
        return `${player.name}: ${state}${track ? `, ${track}` : ''}.`
      })
      .join(' ')
  }

  /** Muda o volume do player (0 a 100), para um valor ou somando `delta`. */
  async volume(
    level: number | undefined,
    delta: number | undefined,
    target?: string
  ): Promise<string> {
    const players = await this.players()
    const chosen = this.choose(players, 'tocar', target)
    if (typeof chosen === 'string') return chosen
    const player = chosen[0]
    if (player.volume === undefined) return `${player.name} não informa o volume pelo MPRIS.`
    const next = level !== undefined ? level / 100 : player.volume + (delta ?? 0) / 100
    const clamped = Math.min(1, Math.max(0, next))
    await this.bus.call({
      destination: player.bus,
      path: PATH,
      interface: 'org.freedesktop.DBus.Properties',
      member: 'Set',
      signature: 'ssv',
      body: [PLAYER, 'Volume', new Variant('d', clamped)],
      timeout: CALL_TIMEOUT_MS
    })
    return `Volume do ${player.name}: ${Math.round(clamped * 100)}%.`
  }

  /**
   * Para quem vai o comando. Com `target`, o player com esse nome. Sem ele: pausar e parar valem
   * para todos que estão tocando; o resto, para o que está tocando, o último que tocou ou o
   * primeiro que aceita controle.
   */
  private choose(
    players: PlayerInfo[],
    action: MediaAction,
    target?: string
  ): PlayerInfo[] | string {
    const controllable = players.filter((player) => player.canControl)
    if (!controllable.length) {
      return players.length
        ? 'Os players abertos não aceitam controle.'
        : 'Nenhum player de música ou vídeo aberto (que fale MPRIS).'
    }
    if (target?.trim()) {
      const wanted = fold(target.trim())
      const found = controllable.filter(
        (player) => fold(player.name).includes(wanted) || fold(player.bus).includes(wanted)
      )
      return found.length
        ? [found[0]]
        : `Não achei o player "${target}". Abertos: ${controllable.map((p) => p.name).join(', ')}.`
    }
    const playing = controllable.filter((player) => player.status === 'Playing')
    if (action === 'pausar' || action === 'parar') {
      return playing.length ? playing : 'Nada está tocando.'
    }
    if (playing.length) return [playing[0]]
    const last = controllable.find((player) => player.bus === this.lastActive)
    return [last ?? controllable[0]]
  }

  private async playerNames(): Promise<string[]> {
    const [names] = await this.bus.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'ListNames'
    })
    return (names as string[]).filter((name) => name.startsWith(PREFIX)).sort()
  }

  private async info(name: string): Promise<PlayerInfo | null> {
    try {
      const [root, player] = await Promise.all([
        this.bus.getAllProperties(name, PATH, ROOT).catch(() => ({}) as Record<string, unknown>),
        this.bus.getAllProperties(name, PATH, PLAYER)
      ])
      const metadata = (player.Metadata ?? {}) as Record<string, unknown>
      const artist = metadata['xesam:artist']
      const status = String(player.PlaybackStatus ?? 'Stopped')
      this.setStatus(name, status)
      return {
        bus: name,
        name:
          typeof root.Identity === 'string' && root.Identity
            ? root.Identity
            : name.slice(PREFIX.length),
        status,
        ...(typeof metadata['xesam:title'] === 'string' && metadata['xesam:title']
          ? { title: metadata['xesam:title'] }
          : {}),
        ...(Array.isArray(artist) && artist.length ? { artist: artist.join(', ') } : {}),
        ...(typeof metadata['xesam:album'] === 'string' && metadata['xesam:album']
          ? { album: metadata['xesam:album'] }
          : {}),
        ...(typeof player.Volume === 'number' ? { volume: player.Volume } : {}),
        canControl: player.CanControl !== false
      }
    } catch {
      return null
    }
  }

  /** Acompanha os players: quem abre e fecha (NameOwnerChanged) e quem toca (PropertiesChanged). */
  private async watch(): Promise<void> {
    await this.bus.subscribe(
      {
        sender: 'org.freedesktop.DBus',
        interface: 'org.freedesktop.DBus',
        member: 'NameOwnerChanged'
      },
      (signal) => this.onOwnerChanged(signal)
    )
    await this.bus.subscribe(
      { path: PATH, interface: 'org.freedesktop.DBus.Properties', member: 'PropertiesChanged' },
      (signal) => this.onPropertiesChanged(signal)
    )
    for (const name of await this.playerNames().catch(() => [])) {
      await this.track(name)
    }
    this.notify()
  }

  private async track(name: string): Promise<void> {
    try {
      const [owner] = await this.bus.call({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'GetNameOwner',
        signature: 's',
        body: [name]
      })
      this.owners.set(owner as string, name)
      const status = await this.bus.getProperty(name, PATH, PLAYER, 'PlaybackStatus')
      this.setStatus(name, String(status))
    } catch {
      // O player fechou no meio do caminho.
    }
  }

  private onOwnerChanged(signal: Signal): void {
    const [name, , newOwner] = signal.body as [string, string, string]
    if (!name.startsWith(PREFIX)) return
    for (const [owner, player] of this.owners) if (player === name) this.owners.delete(owner)
    if (newOwner) {
      void this.track(name).then(() => this.notify())
    } else {
      this.statuses.delete(name)
      this.notify()
    }
  }

  private onPropertiesChanged(signal: Signal): void {
    const [iface, changed, invalidated] = signal.body as [string, Record<string, unknown>, string[]]
    if (iface !== PLAYER) return
    const name = this.owners.get(signal.sender)
    if (!name) return
    const values = plain(changed) as Record<string, unknown>
    if (typeof values.PlaybackStatus === 'string') {
      this.setStatus(name, values.PlaybackStatus)
      this.notify()
    } else if (invalidated?.includes('PlaybackStatus')) {
      void this.track(name).then(() => this.notify())
    }
  }

  private setStatus(name: string, status: string): void {
    const before = this.statuses.get(name)
    this.statuses.set(name, status)
    if (status === 'Playing' && before !== 'Playing') this.lastActive = name
  }

  /** Avisa quando "algum player tocando" muda (o mascote começa ou para de dançar). */
  private notify(): void {
    const playing = this.playing
    if (playing === this.wasPlaying) return
    this.wasPlaying = playing
    this.emit('playing', playing)
  }
}

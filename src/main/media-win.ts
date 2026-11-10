// Os players de música e vídeo no Windows (Fase 35): o controle de mídia do próprio Windows (o
// mesmo do painel de volume e da tela de bloqueio), que fala com Spotify, navegadores, o player do
// Windows e qualquer app que se registre nele. Desde a Fase 37, um PowerShell fica acompanhando os
// players (media-win-watch.ts): o mascote dança e a ilha mostra a música, como no Linux.
// Os players do Windows não mostram o volume deles: o volume é o do sistema.

import { EventEmitter } from 'events'
import { choosePlayers, describeAfter, METHODS } from './media'
import type { MediaAction, MediaPlayers, PlayerInfo } from './media'
import { firstLine, importModule, powerShellJson, runPowerShell } from './powershell'
import { setAppVolume } from './volume-app-win'
import { setWindowsVolume } from './volume-win'
import { MANAGER, WindowsMediaWatcher, windowsMusic } from './media-win-watch'
import type { WatchedSession } from './media-win-watch'
import type { IslandMusic, IslandMusicAction } from '../shared/ipc'
import { t } from '../shared/i18n'

/** As sessões, com o nome do app pelo menu Iniciar (o id de um app nem sempre diz qual é). */
const LIST =
  MANAGER +
  '$apps = @{}; $sessoes = @($gerente.GetSessions()); ' +
  'if ($sessoes.Count -gt 0) { try { ' +
  importModule('StartLayout') +
  'foreach ($a in @(Get-StartApps)) { $apps[[string]$a.AppID] = $a.Name } } catch {} }; ' +
  '$saida = foreach ($s in $sessoes) { ' +
  '$info = $s.GetPlaybackInfo(); $props = $null; ' +
  'try { $props = Esperar ($s.TryGetMediaPropertiesAsync()) ' +
  '([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}; ' +
  '$id = [string]$s.SourceAppUserModelId; ' +
  '[pscustomobject]@{ id = $id; name = $(if ($apps.ContainsKey($id)) { $apps[$id] }); ' +
  'status = [string]$info.PlaybackStatus; title = $(if ($props) { $props.Title }); ' +
  'artist = $(if ($props) { $props.Artist }); album = $(if ($props) { $props.AlbumTitle }); ' +
  'canControl = [bool]($info.Controls.IsPlayPauseToggleEnabled -or $info.Controls.IsPlayEnabled -or ' +
  '$info.Controls.IsPauseEnabled) } }; ' +
  'ConvertTo-Json -InputObject @($saida) -Compress'

/** Uma ação (WISP_ACAO, o nome do METHODS) no player WISP_PLAYER. */
const CONTROL =
  MANAGER +
  '$s = @($gerente.GetSessions()) | Where-Object { $_.SourceAppUserModelId -eq $env:WISP_PLAYER } | ' +
  'Select-Object -First 1; ' +
  "if (-not $s) { 'sumiu' } else { $op = switch ($env:WISP_ACAO) { " +
  "'Play' { $s.TryPlayAsync() } 'Pause' { $s.TryPauseAsync() } " +
  "'PlayPause' { $s.TryTogglePlayPauseAsync() } 'Stop' { $s.TryStopAsync() } " +
  "'Next' { $s.TrySkipNextAsync() } 'Previous' { $s.TrySkipPreviousAsync() } }; " +
  "if ($op -and (Esperar $op ([bool]))) { 'ok' } else { 'recusou' } }"

/** O que o script devolve de cada sessão. */
interface RawSession {
  id: string
  name: string | null
  status: string
  title: string | null
  artist: string | null
  album: string | null
  canControl: boolean
}

/**
 * Um nome para o app quando o menu Iniciar não diz: "Spotify.exe" → "Spotify",
 * "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" → "ZuneMusic".
 */
export function appNameOf(id: string): string {
  const app = id.includes('!') ? id.slice(id.lastIndexOf('!') + 1) : id
  const base = (app.split(/[\\/]/).pop() ?? app).replace(/\.exe$/i, '')
  const name = base.includes('.') ? (base.split('.').pop() ?? base) : base
  return name ? name[0].toUpperCase() + name.slice(1) : id
}

/** Uma sessão do Windows como um player do Wisp (os estados do Windows nos do MPRIS). */
export function playerOf(session: RawSession): PlayerInfo {
  const status =
    session.status === 'Playing' ? 'Playing' : session.status === 'Paused' ? 'Paused' : 'Stopped'
  return {
    bus: session.id,
    name: session.name?.trim() || appNameOf(session.id),
    status,
    ...(session.title ? { title: session.title } : {}),
    ...(session.artist ? { artist: session.artist } : {}),
    ...(session.album ? { album: session.album } : {}),
    canControl: session.canControl
  }
}

/** As sessões que o PowerShell que acompanha a música viu, como as do LIST. */
function rawOf(session: WatchedSession, name: string | null): RawSession {
  return {
    id: session.id,
    name,
    status: session.status,
    title: session.title,
    artist: session.artist,
    album: session.album,
    canControl: session.canPlayPause
  }
}

export class WindowsMedia extends EventEmitter implements MediaPlayers {
  private statuses = new Map<string, string>()
  private lastActive: string | null = null
  private wasPlaying = false
  /** O PowerShell que acompanha a música (Fase 37); sem ele, o Wisp pergunta a cada vez. */
  private readonly watcher: WindowsMediaWatcher

  private restarts = 0
  private disposed = false

  constructor(watcher = new WindowsMediaWatcher()) {
    super()
    this.watcher = watcher
    this.watcher.on('sessions', (sessions: WatchedSession[]) => {
      this.track(sessions.map((session) => playerOf(rawOf(session, session.name))))
      this.emit('changed')
    })
    this.watcher.on('volume', () => this.emit('changed'))
    // O "não perturbe" do Windows vem no mesmo script (Fase 40).
    this.watcher.on('dnd', (active: boolean) => this.emit('dnd', active))
    this.watcher.on('exit', () => {
      // Caiu (o Windows fechou o PowerShell, um erro): volta uma vez, sem insistir.
      if (!this.disposed && this.restarts++ < 1) setTimeout(() => this.watch(), 5000)
    })
  }

  /** Começa a acompanhar a música (o PowerShell que fica aberto). Devolve o próprio objeto. */
  watch(): this {
    if (!this.disposed) this.watcher.start()
    return this
  }

  get playing(): boolean {
    return [...this.statuses.values()].includes('Playing')
  }

  dispose(): void {
    this.disposed = true
    this.watcher.dispose()
    this.removeAllListeners()
  }

  setWatching(on: boolean): void {
    this.watcher.send({ acao: 'Rapido', valor: on })
    // O volume do sistema, para a barrinha da ilha (lido uma vez).
    if (on && this.watcher.volume === null) this.watcher.send({ acao: 'Volume', valor: -1 })
  }

  async players(): Promise<PlayerInfo[]> {
    const watched = this.watcher.sessions
    if (watched) return watched.map((session) => playerOf(rawOf(session, session.name)))
    const sessions = await powerShellJson<RawSession[]>(LIST)
    if (!Array.isArray(sessions)) throw new Error(t('o Windows não respondeu'))
    const players = sessions.filter((session) => typeof session?.id === 'string').map(playerOf)
    this.track(players)
    return players
  }

  async nowPlaying(): Promise<IslandMusic | null> {
    const sessions = this.watcher.sessions
    if (!sessions?.length) return null
    const session =
      sessions.find((item) => item.status === 'Playing') ??
      sessions.find((item) => item.id === this.lastActive) ??
      sessions[0]
    return windowsMusic(session, session.name?.trim() || appNameOf(session.id), this.watcher.volume)
  }

  async musicAction(action: IslandMusicAction): Promise<void> {
    const music = await this.nowPlaying()
    if (!music) return
    const id = music.id
    switch (action.type) {
      case 'toggle':
        this.watcher.send({ id, acao: 'PlayPause' })
        break
      case 'next':
        this.watcher.send({ id, acao: 'Next' })
        break
      case 'previous':
        this.watcher.send({ id, acao: 'Previous' })
        break
      case 'seek':
        this.watcher.send({ id, acao: 'Seek', valor: action.ms })
        break
      case 'shuffle':
        this.watcher.send({ id, acao: 'Shuffle', valor: action.on })
        break
      case 'repeat':
        this.watcher.send({
          id,
          acao: 'Repeat',
          valor: action.mode === 'track' ? 'Track' : action.mode === 'list' ? 'List' : 'None'
        })
        break
      case 'volume':
        this.watcher.send({ acao: 'Volume', valor: Math.round(action.level * 100) })
        break
    }
  }

  async control(action: MediaAction, target?: string): Promise<string> {
    const players = await this.players()
    const chosen = choosePlayers(
      players,
      action,
      target,
      this.lastActive,
      t('Nenhum player de música ou vídeo aberto.')
    )
    if (typeof chosen === 'string') return chosen
    for (const player of chosen) {
      // Pelo PowerShell que acompanha a música, se ele estiver aberto; senão, um script só.
      if (this.watcher.send({ id: player.bus, acao: METHODS[action] as 'PlayPause' })) continue
      const result = await runPowerShell(CONTROL, {
        WISP_PLAYER: player.bus,
        WISP_ACAO: METHODS[action]
      })
      if (result.code !== 0)
        throw new Error(firstLine(result.stderr) || t('o Windows não respondeu'))
    }
    // O player leva um instante para mudar de faixa ou de estado.
    await new Promise((resolve) => setTimeout(resolve, this.watcher.running ? 900 : 400))
    const after = await this.players()
    return describeAfter(after.filter((player) => chosen.some((c) => c.bus === player.bus)))
  }

  /**
   * O volume do player, pelo mixer de volume do Windows (Fase 69): o do programa que toca (ou o
   * de `only`). Se ele não tem uma sessão de áudio aberta, muda o do sistema, como antes.
   */
  async volume(
    level: number | undefined,
    delta: number | undefined,
    only?: string
  ): Promise<string> {
    const change = level !== undefined ? { level } : { step: delta ?? 0 }
    const players = await this.players().catch(() => [])
    const wanted = only?.trim().toLowerCase()
    const player = wanted
      ? players.find((item) => item.name.toLowerCase().includes(wanted))
      : (players.find((item) => item.status === 'Playing') ?? players[0])
    const own = player ? await setAppVolume(appNameOf(player.bus), change) : null
    if (own !== null && player) {
      return t('O volume do {player} ficou em {level}%.', { player: player.name, level: own })
    }
    const result = await setWindowsVolume(change)
    if (typeof result !== 'number') {
      return t('Não consegui mudar o volume do Windows: {error}.', { error: result.error })
    }
    this.watcher.volume = result
    return t(
      'No Windows, os players não mostram o volume deles: o volume do sistema ficou em {level}%.',
      {
        level: result
      }
    )
  }

  /** Quem toca agora: o mascote dança, e o último que tocou vira o player atual. */
  private track(players: PlayerInfo[]): void {
    for (const player of players) {
      if (player.status === 'Playing' && this.statuses.get(player.bus) !== 'Playing') {
        this.lastActive = player.bus
      }
    }
    this.statuses = new Map(players.map((player) => [player.bus, player.status]))
    if (this.playing !== this.wasPlaying) {
      this.wasPlaying = this.playing
      this.emit('playing', this.playing)
    }
  }
}

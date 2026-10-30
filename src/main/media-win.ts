// Os players de música e vídeo no Windows (Fase 35): o controle de mídia do próprio Windows (o
// mesmo do painel de volume e da tela de bloqueio), que fala com Spotify, navegadores, o player do
// Windows e qualquer app que se registre nele. Por um script fixo do PowerShell, só quando pedem:
// o Wisp não fica esperando os players mudarem (o mascote dança com o que viu na última vez).
// Os players do Windows não mostram o volume deles: o volume é o do sistema.

import { EventEmitter } from 'events'
import { choosePlayers, describeAfter, METHODS } from './media'
import type { MediaAction, MediaPlayers, PlayerInfo } from './media'
import { firstLine, powerShellJson, runPowerShell } from './powershell'
import { setWindowsVolume } from './volume-win'
import { t } from '../shared/i18n'

// O gerente das sessões de mídia (WinRT), esperando as operações assíncronas pelo AsTask.
const MANAGER =
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime; ' +
  "$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and " +
  "$_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]; " +
  'function Esperar($op, [Type]$tipo) { $tarefa = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); ' +
  '[void]$tarefa.Wait(-1); $tarefa.Result }; ' +
  '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]; ' +
  '$gerente = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ' +
  '([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]); '

/** As sessões, com o nome do app pelo menu Iniciar (o id de um app nem sempre diz qual é). */
const LIST =
  MANAGER +
  '$apps = @{}; $sessoes = @($gerente.GetSessions()); ' +
  'if ($sessoes.Count -gt 0) { try { foreach ($a in @(Get-StartApps)) { $apps[[string]$a.AppID] = $a.Name } } catch {} }; ' +
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

export class WindowsMedia extends EventEmitter implements MediaPlayers {
  private statuses = new Map<string, string>()
  private lastActive: string | null = null
  private wasPlaying = false

  get playing(): boolean {
    return [...this.statuses.values()].includes('Playing')
  }

  dispose(): void {
    this.removeAllListeners()
  }

  async players(): Promise<PlayerInfo[]> {
    const sessions = await powerShellJson<RawSession[]>(LIST)
    if (!Array.isArray(sessions)) throw new Error(t('o Windows não respondeu'))
    const players = sessions.filter((session) => typeof session?.id === 'string').map(playerOf)
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
    return players
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
      const result = await runPowerShell(CONTROL, {
        WISP_PLAYER: player.bus,
        WISP_ACAO: METHODS[action]
      })
      if (result.code !== 0)
        throw new Error(firstLine(result.stderr) || t('o Windows não respondeu'))
    }
    // O player leva um instante para mudar de faixa ou de estado.
    await new Promise((resolve) => setTimeout(resolve, 400))
    const after = await this.players()
    return describeAfter(after.filter((player) => chosen.some((c) => c.bus === player.bus)))
  }

  /** No Windows, os players não mostram o volume deles: muda o do sistema. */
  async volume(level: number | undefined, delta: number | undefined): Promise<string> {
    const result = await setWindowsVolume(level !== undefined ? { level } : { step: delta ?? 0 })
    if (typeof result !== 'number') {
      return t('Não consegui mudar o volume do Windows: {error}.', { error: result.error })
    }
    return t(
      'No Windows, os players não mostram o volume deles: o volume do sistema ficou em {level}%.',
      {
        level: result
      }
    )
  }
}

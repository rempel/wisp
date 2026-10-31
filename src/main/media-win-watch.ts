// A música no Windows, acompanhada (Fase 37): um PowerShell que fica aberto lendo o controle de
// mídia do Windows (o mesmo do painel de volume) e escreve uma linha JSON quando algo muda (um
// player abriu, tocou, pausou, trocou de faixa). Ele também recebe os botões da ilha pela entrada,
// uma linha JSON por comando, e responde com a lista nova: sem abrir um PowerShell a cada clique.
// O script é fixo; os comandos são dados (o id do player, a ação, um número), nunca código.
//
// O Windows não avisa um script do PowerShell quando a música muda sem um laço esperando os
// eventos; o laço daqui lê a lista de tempos em tempos (1,5 s com a ilha aberta, 4 s sem ela) e
// escreve só quando ela muda. Parado e sem player nenhum, cada leitura é uma chamada só.

import type { ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { importModule, startPowerShell } from './powershell'
import { NATIVE as VOLUME_NATIVE } from './volume-win'
import type { IslandMusic, IslandRepeat } from '../shared/ipc'

// O gerente das sessões de mídia (WinRT), esperando as operações assíncronas pelo AsTask.
export const MANAGER =
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime; ' +
  "$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and " +
  "$_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]; " +
  'function Esperar($op, [Type]$tipo) { $tarefa = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); ' +
  '[void]$tarefa.Wait(-1); $tarefa.Result }; ' +
  '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]; ' +
  '$gerente = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ' +
  '([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]); '

/** Uma sessão de mídia como o script escreve. */
export interface WatchedSession {
  id: string
  name: string | null
  status: string
  title: string | null
  artist: string | null
  album: string | null
  art: string | null
  positionMs: number
  startMs: number
  endMs: number
  /** Quando o player atualizou a posição (ms Unix). */
  updated: number
  canPlayPause: boolean
  canNext: boolean
  canPrevious: boolean
  canSeek: boolean
  canShuffle: boolean
  canRepeat: boolean
  shuffle: boolean | null
  repeat: string | null
}

/** Um comando para o script. */
export type WatchCommand =
  | { id: string; acao: 'PlayPause' | 'Play' | 'Pause' | 'Stop' | 'Next' | 'Previous' }
  | { id: string; acao: 'Seek'; valor: number }
  | { id: string; acao: 'Shuffle'; valor: boolean }
  | { id: string; acao: 'Repeat'; valor: 'None' | 'Track' | 'List' }
  | { acao: 'Volume'; valor: number }
  | { acao: 'Rapido'; valor: boolean }

const WATCH =
  MANAGER +
  // Os tipos que a capa e o repetir usam (sem eles, só a capa ou o repetir falham).
  'try { $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]; ' +
  '$null = [Windows.Media.MediaPlaybackAutoRepeatMode,Windows.Media,ContentType=WindowsRuntime] } catch {}; ' +
  '$nomes = $null; ' +
  'function Nomes { if ($null -eq $script:nomes) { $script:nomes = @{}; try { ' +
  importModule('StartLayout') +
  'foreach ($a in @(Get-StartApps)) { $script:nomes[[string]$a.AppID] = $a.Name } } catch {} }; ' +
  '$script:nomes }; ' +
  // A capa (a miniatura que o player dá ao Windows), lida só quando a faixa muda.
  'function Capa($p) { try { if (-not $p.Thumbnail) { return $null }; ' +
  '$s = Esperar ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]); ' +
  '$net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($s); ' +
  '$ms = New-Object System.IO.MemoryStream; $net.CopyTo($ms); $net.Dispose(); ' +
  'if ($ms.Length -gt 1500000) { return $null }; $tipo = [string]$s.ContentType; ' +
  "if ($tipo -notmatch '^image/') { $tipo = 'image/png' }; " +
  "'data:' + $tipo + ';base64,' + [Convert]::ToBase64String($ms.ToArray()) } catch { $null } }; " +
  '$faixas = @{}; ' +
  'function Ler { $saida = foreach ($s in @($gerente.GetSessions())) { ' +
  '$id = [string]$s.SourceAppUserModelId; $info = $s.GetPlaybackInfo(); $c = $info.Controls; ' +
  '$t = $s.GetTimelineProperties(); $p = $null; ' +
  'try { $p = Esperar ($s.TryGetMediaPropertiesAsync()) ' +
  '([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}; ' +
  "$chave = $(if ($p) { [string]$p.Title + '|' + [string]$p.Artist + '|' + [string]$p.AlbumTitle } else { '' }); " +
  '$f = $faixas[$id]; if (-not $f -or $f.chave -ne $chave) { ' +
  '$f = @{ chave = $chave; capa = $(if ($p) { Capa $p }) }; $faixas[$id] = $f }; ' +
  '$n = Nomes; ' +
  '[pscustomobject]@{ id = $id; name = $(if ($n.ContainsKey($id)) { $n[$id] }); ' +
  'status = [string]$info.PlaybackStatus; title = $(if ($p) { $p.Title }); ' +
  'artist = $(if ($p) { $p.Artist }); album = $(if ($p) { $p.AlbumTitle }); art = $f.capa; ' +
  'positionMs = [long]$t.Position.TotalMilliseconds; startMs = [long]$t.StartTime.TotalMilliseconds; ' +
  'endMs = [long]$t.EndTime.TotalMilliseconds; updated = [long]$t.LastUpdatedTime.ToUnixTimeMilliseconds(); ' +
  'canPlayPause = [bool]($c.IsPlayPauseToggleEnabled -or $c.IsPlayEnabled -or $c.IsPauseEnabled); ' +
  'canNext = [bool]$c.IsNextEnabled; canPrevious = [bool]$c.IsPreviousEnabled; ' +
  'canSeek = [bool]$c.IsPlaybackPositionEnabled; canShuffle = [bool]$c.IsShuffleEnabled; ' +
  'canRepeat = [bool]$c.IsRepeatEnabled; shuffle = $info.IsShuffleActive; ' +
  'repeat = $(if ($null -ne $info.AutoRepeatMode) { [string]$info.AutoRepeatMode }) } }; ' +
  'ConvertTo-Json -InputObject @($saida) -Compress -Depth 3 }; ' +
  // O volume do sistema: o C# do volume-win.ts, compilado só quando a ilha pede.
  '$som = $false; ' +
  'function Volume($nivel) { if (-not $script:som) { ' +
  `Add-Type -TypeDefinition '${VOLUME_NATIVE}'; $script:som = $true }; ` +
  '[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ volume = [Wisp.Som]::Mudar([int]$nivel, 0) } -Compress)) }; ' +
  '$rapido = $false; ' +
  'function Fazer($linha) { $cmd = $linha | ConvertFrom-Json; $acao = [string]$cmd.acao; ' +
  "if ($acao -eq 'Rapido') { $script:rapido = [bool]$cmd.valor; return }; " +
  "if ($acao -eq 'Volume') { Volume ([int]$cmd.valor); return }; " +
  '$s = @($gerente.GetSessions()) | Where-Object { $_.SourceAppUserModelId -eq [string]$cmd.id } | ' +
  'Select-Object -First 1; if (-not $s) { return }; ' +
  '$op = switch ($acao) { ' +
  "'PlayPause' { $s.TryTogglePlayPauseAsync() } 'Play' { $s.TryPlayAsync() } " +
  "'Pause' { $s.TryPauseAsync() } 'Stop' { $s.TryStopAsync() } " +
  "'Next' { $s.TrySkipNextAsync() } 'Previous' { $s.TrySkipPreviousAsync() } " +
  "'Seek' { $s.TryChangePlaybackPositionAsync([long]$cmd.valor * 10000) } " +
  "'Shuffle' { $s.TryChangeShuffleActiveAsync([bool]$cmd.valor) } " +
  "'Repeat' { $s.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode][string]$cmd.valor) } }; " +
  'if ($op) { [void](Esperar $op ([bool])) } }; ' +
  // A entrada pela stream crua: o [Console]::In do PowerShell 5.1 leria de forma síncrona.
  '$leitor = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8); ' +
  "$entrada = $leitor.ReadLineAsync(); $ultimo = ''; " +
  'while ($true) { $json = $ultimo; ' +
  'try { $json = Ler } catch { [Console]::Error.WriteLine($_.Exception.Message) }; ' +
  'if ($json -ne $ultimo) { $ultimo = $json; [Console]::Out.WriteLine($json) }; ' +
  '$espera = $(if ($rapido) { 1500 } else { 4000 }); ' +
  'if ($entrada.Wait($espera)) { $linha = $entrada.Result; if ($null -eq $linha) { break }; ' +
  'try { Fazer $linha } catch { [Console]::Error.WriteLine($_.Exception.Message) }; ' +
  '$entrada = $leitor.ReadLineAsync(); Start-Sleep -Milliseconds 250 } }'

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** Uma linha do script: a lista de sessões, ou o volume do sistema. null se não for nenhum. */
export function parseWatchLine(
  line: string
): { sessions: WatchedSession[] } | { volume: number } | null {
  let data: unknown
  try {
    data = JSON.parse(line)
  } catch {
    return null
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const volume = (data as { volume?: unknown }).volume
    return typeof volume === 'number' && volume >= 0 && volume <= 100 ? { volume } : null
  }
  if (!Array.isArray(data)) return null
  const sessions: WatchedSession[] = []
  for (const item of data) {
    const raw = (item ?? {}) as Record<string, unknown>
    const id = str(raw.id)
    if (!id) continue
    const art = str(raw.art)
    sessions.push({
      id,
      name: str(raw.name),
      status: str(raw.status) ?? 'Stopped',
      title: str(raw.title),
      artist: str(raw.artist),
      album: str(raw.album),
      art: art && art.startsWith('data:image/') ? art : null,
      positionMs: num(raw.positionMs),
      startMs: num(raw.startMs),
      endMs: num(raw.endMs),
      updated: num(raw.updated),
      canPlayPause: raw.canPlayPause === true,
      canNext: raw.canNext === true,
      canPrevious: raw.canPrevious === true,
      canSeek: raw.canSeek === true,
      canShuffle: raw.canShuffle === true,
      canRepeat: raw.canRepeat === true,
      shuffle: typeof raw.shuffle === 'boolean' ? raw.shuffle : null,
      repeat: str(raw.repeat)
    })
  }
  return { sessions }
}

const REPEAT: Record<string, IslandRepeat> = { None: 'none', Track: 'track', List: 'list' }

/** Uma sessão do Windows como a ilha mostra (o volume é o do sistema). */
export function windowsMusic(
  session: WatchedSession,
  app: string,
  volume: number | null,
  now = Date.now()
): IslandMusic {
  const status =
    session.status === 'Playing' ? 'Playing' : session.status === 'Paused' ? 'Paused' : 'Stopped'
  const duration = session.endMs - session.startMs
  // A posição que o player deu, mais o tempo desde então (tocando).
  const since = status === 'Playing' && session.updated > 0 ? Math.max(0, now - session.updated) : 0
  const position = session.positionMs - session.startMs + since
  return {
    id: session.id,
    app,
    status,
    ...(session.title ? { title: session.title } : {}),
    ...(session.artist ? { artist: session.artist } : {}),
    ...(session.album ? { album: session.album } : {}),
    ...(session.art ? { art: session.art } : {}),
    ...(duration > 0
      ? { durationMs: duration, positionMs: Math.min(duration, Math.max(0, position)) }
      : {}),
    at: now,
    canControl: session.canPlayPause,
    canSeek: session.canSeek && duration > 0,
    canNext: session.canNext,
    canPrevious: session.canPrevious,
    shuffle: session.canShuffle ? (session.shuffle ?? false) : null,
    repeat: session.canRepeat ? (REPEAT[session.repeat ?? 'None'] ?? 'none') : null,
    volume: volume === null ? null : volume / 100,
    volumeOf: 'system'
  }
}

/**
 * O PowerShell que acompanha a música. 'sessions' quando a lista muda; 'volume' quando o volume
 * do sistema é lido ou muda; 'exit' quando ele fecha (o Wisp volta a perguntar a cada vez).
 */
export class WindowsMediaWatcher extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  sessions: WatchedSession[] | null = null
  volume: number | null = null

  constructor(
    private readonly spawn: (script: string) => ChildProcessWithoutNullStreams = startPowerShell
  ) {
    super()
  }

  get running(): boolean {
    return this.child !== null
  }

  start(): void {
    if (this.child) return
    const child = this.spawn(WATCH)
    this.child = child
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => this.read(chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      const line = chunk.split(/\r?\n/).find((item) => item.trim())
      if (line) console.warn(`[wisp] música: ${line.trim().slice(0, 200)}`)
    })
    // O Wisp fechando com o PowerShell no meio de uma escrita: só fecha.
    child.stdin.on('error', () => {})
    child.on('error', (err) => console.warn(`[wisp] música: ${err.message}`))
    child.on('close', () => {
      if (this.child !== child) return
      this.child = null
      this.sessions = null
      this.emit('exit')
    })
  }

  /** Manda um comando (um botão da ilha, a pressa de quando ela abre). */
  send(command: WatchCommand): boolean {
    if (!this.child) return false
    this.child.stdin.write(`${JSON.stringify(command)}\n`)
    return true
  }

  dispose(): void {
    const child = this.child
    this.child = null
    if (!child) return
    child.stdin.end()
    child.kill()
  }

  private read(chunk: string): void {
    this.buffer += chunk
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (!line) continue
      const parsed = parseWatchLine(line)
      if (!parsed) continue
      if ('volume' in parsed) {
        this.volume = parsed.volume
        this.emit('volume', parsed.volume)
      } else {
        this.sessions = parsed.sessions
        this.emit('sessions', parsed.sessions)
      }
    }
    // Uma linha sem fim grande demais (uma capa estragada) não cresce para sempre.
    if (this.buffer.length > 8_000_000) this.buffer = ''
  }
}

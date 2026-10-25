import { readdirSync, readFileSync, statSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { extname, join } from 'path'
import { getConfig, updateConfig } from './config'
import { CONFIG_DIR } from './paths'
import { SOUND_NAMES } from '../shared/ipc'
import type { ChatEvent, SoundName, SoundSettings } from '../shared/ipc'

/** ~/.config/wisp/sounds: um arquivo com o nome de um som ("pronto.ogg") toma o lugar dele. */
export const SOUNDS_DIR = join(CONFIG_DIR, 'sounds')

/** Formatos que o Chromium decodifica. */
const EXTENSIONS = new Set(['.wav', '.ogg', '.oga', '.opus', '.mp3', '.flac', '.m4a', '.webm'])
/** Um som é curto: arquivos maiores que isso ficam de fora. */
const MAX_BYTES = 2 * 1024 * 1024
/** O mesmo som de novo antes disso (ms) não toca: eventos em rajada não viram barulho. */
const REPEAT_MS = 400
/** Espera os arquivos pararem de mudar antes de reler a pasta (ms). */
const RESCAN_MS = 300

/** O som de cada evento da conversa, se houver. */
export function soundForEvent(event: ChatEvent): SoundName | null {
  switch (event.type) {
    case 'busy':
      return event.busy ? 'enviar' : null
    case 'permission-request':
      return 'pedido'
    case 'turn-end':
      return event.outcome === 'done' ? 'pronto' : event.outcome === 'error' ? 'erro' : null
    case 'notice':
      return event.level === 'error' ? 'erro' : null
    default:
      return null
  }
}

export interface SoundOutput {
  /** Toca um som no mascote. */
  play(name: SoundName, volume: number): void
  /** Agora, nenhum som (o "não perturbe" do desktop, Fase 32). */
  muted?(): boolean
  /** Um som da pasta chegou, mudou (bytes) ou saiu (null). */
  custom(name: SoundName, data: Buffer | null): void
  /** Os sons foram ligados ou desligados (o botão de mudo acompanha). */
  changed(settings: SoundSettings): void
}

interface SoundFile {
  path: string
  size: number
  mtime: number
}

/**
 * Os sons do Wisp: quem decide se tocam (config `sound` e `volume`) e os arquivos da pasta de
 * sons, que tomam o lugar dos sintetizados. Os sons em si tocam na página do mascote (WebAudio).
 */
export class Sounds {
  private readonly lastPlayed = new Map<SoundName, number>()
  private files = new Map<SoundName, SoundFile>()
  private watchers: FSWatcher[] = []
  private dirWatcher: FSWatcher | null = null
  private rescanTimer: NodeJS.Timeout | null = null
  private sent: SoundSettings | null = null
  private readonly warned = new Set<string>()

  constructor(private readonly output: SoundOutput) {}

  /** Como os sons estão agora (relê o config.json se ele mudou). */
  settings(): SoundSettings {
    const { sound, volume } = getConfig()
    return { enabled: sound, volume }
  }

  setEnabled(enabled: boolean): void {
    updateConfig({ sound: enabled })
    this.check()
  }

  /** Toca um som, se os sons estiverem ligados. */
  play(name: SoundName): void {
    const settings = this.check()
    if (!settings.enabled || settings.volume <= 0 || this.output.muted?.()) return
    const now = Date.now()
    if (now - (this.lastPlayed.get(name) ?? 0) < REPEAT_MS) return
    this.lastPlayed.set(name, now)
    this.output.play(name, settings.volume)
  }

  /** Avisa se os sons mudaram desde o último aviso (o config.json pode ser editado à mão). */
  check(): SoundSettings {
    const settings = this.settings()
    const sent = this.sent
    if (!sent || sent.enabled !== settings.enabled || sent.volume !== settings.volume) {
      this.sent = settings
      this.output.changed(settings)
    }
    return settings
  }

  /** Lê a pasta de sons e passa a acompanhá-la (criar, trocar ou apagar arquivos vale na hora). */
  watch(): void {
    this.rescan()
    try {
      // A pasta pode ainda não existir: quem avisa quando ela aparece é a pasta do config.
      this.watchers.push(
        watch(CONFIG_DIR, { persistent: false }, (_type, name) => {
          if (name === 'sounds') this.scheduleRescan()
        })
      )
    } catch {
      // Sem a pasta do config, fica só com os sons sintetizados.
    }
  }

  /** Manda de novo os sons da pasta (a página do mascote recarregou e perdeu os que tinha). */
  resend(): void {
    for (const [name, file] of this.files) {
      const data = this.read(file.path)
      if (data) this.output.custom(name, data)
    }
  }

  dispose(): void {
    for (const watcher of this.watchers) watcher.close()
    this.dirWatcher?.close()
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
  }

  private scheduleRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null
      this.rescan()
    }, RESCAN_MS)
  }

  /** Relê a pasta e manda só o que mudou. */
  private rescan(): void {
    this.watchDir()
    const found = this.scan()
    for (const [name, file] of found) {
      const before = this.files.get(name)
      if (before && before.path === file.path && before.size === file.size) {
        if (before.mtime === file.mtime) continue
      }
      const data = this.read(file.path)
      if (data) this.output.custom(name, data)
      else found.delete(name)
    }
    for (const name of this.files.keys()) {
      if (!found.has(name)) this.output.custom(name, null)
    }
    this.files = found
  }

  /** Acompanha a pasta de sons, se ela existir (e de novo, se ela foi recriada). */
  private watchDir(): void {
    this.dirWatcher?.close()
    this.dirWatcher = null
    try {
      this.dirWatcher = watch(SOUNDS_DIR, { persistent: false }, () => this.scheduleRescan())
      this.dirWatcher.on('error', () => {
        this.dirWatcher?.close()
        this.dirWatcher = null
      })
    } catch {
      // A pasta não existe (ainda).
    }
  }

  /** Os arquivos da pasta com nome de som, formato conhecido e tamanho razoável. */
  private scan(): Map<SoundName, SoundFile> {
    const found = new Map<SoundName, SoundFile>()
    let entries: string[]
    try {
      entries = readdirSync(SOUNDS_DIR).sort()
    } catch {
      return found
    }
    for (const entry of entries) {
      const ext = extname(entry).toLowerCase()
      const name = entry.slice(0, entry.length - ext.length).toLowerCase() as SoundName
      if (!EXTENSIONS.has(ext) || !SOUND_NAMES.includes(name) || found.has(name)) continue
      const path = join(SOUNDS_DIR, entry)
      try {
        const info = statSync(path)
        if (!info.isFile() || info.size === 0) continue
        if (info.size > MAX_BYTES) {
          this.warnOnce(path, `[wisp] ${path} passa de 2 MB; usando o som do Wisp.`)
          continue
        }
        found.set(name, { path, size: info.size, mtime: info.mtimeMs })
      } catch {
        // Sumiu entre a listagem e a leitura.
      }
    }
    return found
  }

  private read(path: string): Buffer | null {
    try {
      return readFileSync(path)
    } catch (err) {
      this.warnOnce(path, `[wisp] não consegui ler ${path}:`, err)
      return null
    }
  }

  private warnOnce(key: string, ...message: unknown[]): void {
    if (this.warned.has(key)) return
    this.warned.add(key)
    console.warn(...message)
  }
}

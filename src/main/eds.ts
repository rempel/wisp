// As agendas do GNOME pelo Evolution Data Server (Fase 13), pelo D-Bus da sessão: a pessoal e as
// das Contas Online (Google, Microsoft, Nextcloud), com o login que o GNOME já guarda. Só leitura.
//
// O registro de fontes (org.gnome.evolution.dataserver.SourcesN) diz quais agendas existem; a
// fábrica (…CalendarN) abre cada uma, e GetObjectList devolve os eventos de uma janela de tempo
// em iCalendar. O EDS fecha uma agenda quando a conexão que a abriu sai, então tudo passa por uma
// conexão só, que fica aberta.

import { DBusConnection, plain } from './dbus'

const PREFIX = 'org.gnome.evolution.dataserver.'
const SOURCES_PATH = '/org/gnome/evolution/dataserver/SourceManager'
const FACTORY_PATH = '/org/gnome/evolution/dataserver/CalendarFactory'
const TIMEOUT_MS = 30_000

export interface EdsSource {
  uid: string
  name: string
}

/** Um keyfile (o "Data" de cada fonte): grupo → chave → valor, sem as traduções. */
export function parseKeyFile(text: string): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {}
  let current: Record<string, string> | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const group = /^\[(.+)\]$/.exec(line)
    if (group) {
      current = groups[group[1]] ??= {}
      continue
    }
    const eq = line.indexOf('=')
    if (!current || eq < 0) continue
    const key = line.slice(0, eq).trim()
    if (key.includes('[')) continue
    current[key] = line.slice(eq + 1).trim()
  }
  return groups
}

/**
 * As agendas ligadas, da resposta do GetManagedObjects do registro: as fontes com o grupo
 * [Calendar], sem as desligadas (Enabled=false) e sem as escondidas no app de agenda
 * (Selected=false).
 */
export function calendarSources(objects: unknown): EdsSource[] {
  const out: EdsSource[] = []
  for (const interfaces of Object.values(
    (objects ?? {}) as Record<string, Record<string, Record<string, unknown>>>
  )) {
    const source = interfaces?.[`${PREFIX}Source`]
    if (!source || typeof source.UID !== 'string' || typeof source.Data !== 'string') continue
    const data = parseKeyFile(source.Data)
    const calendar = data.Calendar
    if (!calendar) continue
    if (data['Data Source']?.Enabled === 'false' || calendar.Enabled === 'false') continue
    if (calendar.Selected === 'false') continue
    out.push({ uid: source.UID, name: data['Data Source']?.DisplayName || source.UID })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** "20261011T030000Z", como o make-time das buscas do EDS quer. */
function isoTime(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
}

/** O nome com o maior número de versão ("…Calendar8") entre os que o barramento conhece. */
function newest(names: string[], kind: 'Sources' | 'Calendar'): string | null {
  let best: { name: string; version: number } | null = null
  for (const name of names) {
    const match = new RegExp(`^${PREFIX.replace(/\./g, '\\.')}${kind}(\\d+)$`).exec(name)
    if (match && (!best || +match[1] > best.version)) best = { name, version: +match[1] }
  }
  return best?.name ?? null
}

export class EdsCalendars {
  private readonly opened = new Map<string, { path: string; bus: string }>()

  private constructor(
    private readonly bus: DBusConnection,
    private readonly names: { sources: string; calendar: string }
  ) {}

  /** Conecta, se o EDS estiver instalado (o GNOME traz); null sem ele ou sem D-Bus. */
  static async connect(env: NodeJS.ProcessEnv = process.env): Promise<EdsCalendars | null> {
    const bus = await DBusConnection.session(env)
    if (!bus) return null
    try {
      const names: string[] = []
      for (const member of ['ListNames', 'ListActivatableNames']) {
        const [list] = await bus.call({
          destination: 'org.freedesktop.DBus',
          path: '/org/freedesktop/DBus',
          interface: 'org.freedesktop.DBus',
          member
        })
        names.push(...((list as string[]) ?? []))
      }
      const sources = newest(names, 'Sources')
      const calendar = newest(names, 'Calendar')
      if (!sources || !calendar) {
        bus.close()
        return null
      }
      return new EdsCalendars(bus, { sources, calendar })
    } catch {
      bus.close()
      return null
    }
  }

  get alive(): boolean {
    return this.bus.alive
  }

  /** As agendas ligadas. */
  async sources(): Promise<EdsSource[]> {
    const [objects] = await this.bus.call({
      destination: this.names.sources,
      path: SOURCES_PATH,
      interface: 'org.freedesktop.DBus.ObjectManager',
      member: 'GetManagedObjects',
      timeout: TIMEOUT_MS
    })
    return calendarSources(plain(objects))
  }

  /**
   * Os eventos de cada agenda que tocam a janela (os que se repetem vêm uma vez, com a regra).
   * Uma agenda que falha (sem rede, sem login) fica de fora, com o motivo.
   */
  async events(
    from: number,
    to: number
  ): Promise<{ source: EdsSource; texts: string[]; error?: string }[]> {
    const query = `(occur-in-time-range? (make-time "${isoTime(from)}") (make-time "${isoTime(to)}"))`
    const out: { source: EdsSource; texts: string[]; error?: string }[] = []
    for (const source of await this.sources()) {
      try {
        out.push({ source, texts: await this.objects(source.uid, query) })
      } catch (err) {
        // A agenda pode ter sido fechada pelo EDS (reiniciou): abre de novo uma vez.
        this.opened.delete(source.uid)
        try {
          out.push({ source, texts: await this.objects(source.uid, query) })
        } catch (again) {
          out.push({ source, texts: [], error: (again as Error).message || String(err) })
        }
      }
    }
    return out
  }

  close(): void {
    this.bus.close()
  }

  private async objects(uid: string, query: string): Promise<string[]> {
    let target = this.opened.get(uid)
    if (!target) {
      const [path, bus] = await this.bus.call({
        destination: this.names.calendar,
        path: FACTORY_PATH,
        interface: `${PREFIX}CalendarFactory`,
        member: 'OpenCalendar',
        signature: 's',
        body: [uid],
        timeout: TIMEOUT_MS
      })
      target = { path: path as string, bus: bus as string }
      await this.bus.call({
        destination: target.bus,
        path: target.path,
        interface: `${PREFIX}Calendar`,
        member: 'Open',
        timeout: TIMEOUT_MS
      })
      this.opened.set(uid, target)
    }
    const [list] = await this.bus.call({
      destination: target.bus,
      path: target.path,
      interface: `${PREFIX}Calendar`,
      member: 'GetObjectList',
      signature: 's',
      body: [query],
      timeout: TIMEOUT_MS
    })
    return ((list as string[]) ?? []).filter((item) => typeof item === 'string')
  }
}

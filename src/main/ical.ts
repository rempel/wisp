// Leitura de iCalendar (RFC 5545) para a agenda (Fase 13): os eventos (VEVENT) de um .ics ou do
// Evolution Data Server, com as datas no fuso certo, e as repetições (RRULE) abertas numa janela
// de tempo. Só leitura, e só o que uma agenda pessoal usa: repetições diárias, semanais, mensais
// e anuais (com BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, COUNT e UNTIL), datas extras e excluídas
// (RDATE, EXDATE), ocorrências alteradas ou canceladas (RECURRENCE-ID) e eventos de dia inteiro.
// Os fusos vêm do Intl do próprio Node (o banco de fusos do sistema), não do VTIMEZONE do arquivo.

/** Uma ocorrência de um compromisso. */
export interface Occurrence {
  uid: string
  title: string
  /** Início e fim (ms). Num evento de dia inteiro, a meia-noite local do dia e a do dia seguinte. */
  start: number
  end: number
  allDay: boolean
  location: string
  /** O nome da agenda (ou do arquivo) de onde veio. */
  calendar: string
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

/** Uma data e hora "de parede" (sem fuso), do jeito que está escrita. */
interface Wall {
  y: number
  m: number // 1-12
  d: number
  h: number
  mi: number
  s: number
}

/** Como uma data do evento vira um instante: no fuso dela, em UTC, ou no fuso de quem usa. */
type Zone = { kind: 'utc' } | { kind: 'local' } | { kind: 'tz'; tz: string }

interface When {
  wall: Wall
  zone: Zone
  allDay: boolean
}

/** Linhas lógicas: as dobradas (começando com espaço ou tab) voltam a ser uma só. */
export function unfold(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += raw.slice(1)
    } else if (raw) {
      lines.push(raw)
    }
  }
  return lines
}

/** Uma linha: NOME;PARAM=valor;PARAM="valor":VALOR. */
export function parseLine(line: string): Prop | null {
  let i = 0
  let inQuotes = false
  // O ":" que separa o valor é o primeiro fora de aspas.
  for (; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === ':' && !inQuotes) break
  }
  if (i >= line.length) return null
  const head = line.slice(0, i)
  const value = line.slice(i + 1)
  const parts = head.match(/(?:[^;"]|"[^"]*")+/g) ?? []
  const name = (parts.shift() ?? '').toUpperCase()
  if (!name) return null
  const params: Record<string, string> = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

/** O texto de um campo, sem os escapes do iCalendar. */
export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

/** Os VEVENTs do texto, cada um com as suas linhas (sem os VALARM de dentro). */
export function parseEvents(text: string): Prop[][] {
  const events: Prop[][] = []
  let current: Prop[] | null = null
  let depth = 0
  for (const line of unfold(text)) {
    const prop = parseLine(line)
    if (!prop) continue
    if (prop.name === 'BEGIN') {
      if (prop.value.toUpperCase() === 'VEVENT' && !current) {
        current = []
        depth = 0
      } else if (current) {
        depth++
      }
    } else if (prop.name === 'END') {
      if (current && depth === 0 && prop.value.toUpperCase() === 'VEVENT') {
        events.push(current)
        current = null
      } else if (current) {
        depth--
      }
    } else if (current && depth === 0) {
      current.push(prop)
    }
  }
  return events
}

// ---- Fusos -----------------------------------------------------------------

/** Nomes de fuso do Windows (Outlook, Exchange) que mais aparecem, no nome do banco de fusos. */
const WINDOWS_ZONES: Record<string, string> = {
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'GTB Standard Time': 'Europe/Bucharest',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  UTC: 'UTC'
}

const zoneCache = new Map<string, string | null>()

/**
 * O nome do fuso no banco de fusos, ou null se o Node não o conhece. Aceita os prefixos que o
 * libical põe ("/freeassociation.sourceforge.net/Tzfile/America/Sao_Paulo") e nomes do Windows.
 */
export function resolveZone(tzid: string): string | null {
  const cached = zoneCache.get(tzid)
  if (cached !== undefined) return cached
  let name = tzid.trim().replace(/^"|"$/g, '')
  name = WINDOWS_ZONES[name] ?? name
  const slash = name.match(
    /(?:^|\/)((?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/.+)$/
  )
  if (slash) name = slash[1]
  let resolved: string | null
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone
  } catch {
    resolved = null
  }
  zoneCache.set(tzid, resolved)
  return resolved
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Quanto o fuso está à frente de UTC nesse instante (ms). */
function zoneOffset(at: number, tz: string): number {
  let format = formatters.get(tz)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(tz, format)
  }
  const parts: Record<string, number> = {}
  for (const part of format.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return asUtc - Math.floor(at / 1000) * 1000
}

/** O instante de uma data de parede num fuso (no horário de verão, a hora que não existe avança). */
export function wallToInstant(wall: Wall, zone: Zone): number {
  if (zone.kind === 'utc') {
    return Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s)
  }
  if (zone.kind === 'local') {
    return new Date(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s).getTime()
  }
  const guess = Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s)
  const first = guess - zoneOffset(guess, zone.tz)
  const second = guess - zoneOffset(first, zone.tz)
  return second
}

/** "20261012T140000", "20261012T140000Z" ou "20261012". */
function parseWall(value: string): { wall: Wall; utc: boolean; date: boolean } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d, h, mi, s, z] = match
  return {
    wall: { y: +y, m: +m, d: +d, h: h ? +h : 0, mi: mi ? +mi : 0, s: s ? +s : 0 },
    utc: z === 'Z',
    date: h === undefined
  }
}

function parseWhen(prop: Prop | undefined): When | null {
  if (!prop) return null
  const parsed = parseWall(prop.value)
  if (!parsed) return null
  const allDay = parsed.date || prop.params.VALUE?.toUpperCase() === 'DATE'
  if (allDay) return { wall: parsed.wall, zone: { kind: 'local' }, allDay: true }
  if (parsed.utc) return { wall: parsed.wall, zone: { kind: 'utc' }, allDay: false }
  const tz = prop.params.TZID ? resolveZone(prop.params.TZID) : null
  return { wall: parsed.wall, zone: tz ? { kind: 'tz', tz } : { kind: 'local' }, allDay: false }
}

/** "P1D", "PT1H30M", "-PT15M", "P1W". */
export function parseDuration(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim()
  )
  if (!match) return null
  const [, sign, w, d, h, m, s] = match
  const ms =
    ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(m ?? 0) * 60 + +(s ?? 0)) * 1000
  return sign === '-' ? -ms : ms
}

// ---- Datas de parede ---------------------------------------------------------

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** 0 = domingo. */
const weekday = (y: number, m: number, d: number): number =>
  new Date(Date.UTC(y, m - 1, d)).getUTCDay()
const dayNumber = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / 86400000
function fromDayNumber(n: number): { y: number; m: number; d: number } {
  const date = new Date(n * 86400000)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: number | null
  byDay: { n: number; day: number }[]
  byMonthDay: number[]
  byMonth: number[]
  bySetPos: number[]
}

export function parseRule(value: string, untilZone: Zone): Rule | null {
  const parts: Record<string, string> = {}
  for (const piece of value.split(';')) {
    const eq = piece.indexOf('=')
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1)
  }
  const freq = parts.FREQ?.toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const ints = (text: string | undefined): number[] =>
    (text ?? '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isFinite(x) && x !== 0)
  let until: number | null = null
  if (parts.UNTIL) {
    const parsed = parseWall(parts.UNTIL)
    if (parsed) {
      until = parsed.utc
        ? wallToInstant(parsed.wall, { kind: 'utc' })
        : parsed.date
          ? wallToInstant({ ...parsed.wall, h: 23, mi: 59, s: 59 }, untilZone)
          : wallToInstant(parsed.wall, untilZone)
    }
  }
  const byDay = (parts.BYDAY ?? '')
    .split(',')
    .map((x) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ n: m[1] ? parseInt(m[1], 10) : 0, day: WEEKDAYS[m[2].toUpperCase()] }))
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null
  return {
    freq,
    interval: Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1),
    count: count && count > 0 ? count : null,
    until,
    byDay,
    byMonthDay: ints(parts.BYMONTHDAY),
    byMonth: ints(parts.BYMONTH).filter((m) => m >= 1 && m <= 12),
    bySetPos: ints(parts.BYSETPOS)
  }
}

/** Os dias de um mês que a regra pede (com BYDAY, BYMONTHDAY e BYSETPOS), em ordem. */
function monthDays(rule: Rule, y: number, m: number, startDay: number): number[] {
  const last = daysInMonth(y, m)
  let days: number[]
  const fromMonthDay = rule.byMonthDay
    .map((d) => (d > 0 ? d : last + d + 1))
    .filter((d) => d >= 1 && d <= last)
  if (rule.byDay.length) {
    const set = new Set<number>()
    for (const { n, day } of rule.byDay) {
      const all: number[] = []
      for (let d = 1; d <= last; d++) if (weekday(y, m, d) === day) all.push(d)
      if (n === 0) all.forEach((d) => set.add(d))
      else {
        const pick = n > 0 ? all[n - 1] : all[all.length + n]
        if (pick) set.add(pick)
      }
    }
    days = [...set]
    if (rule.byMonthDay.length) days = days.filter((d) => fromMonthDay.includes(d))
  } else if (rule.byMonthDay.length) {
    days = fromMonthDay
  } else {
    days = startDay <= last ? [startDay] : []
  }
  days = [...new Set(days)].sort((a, b) => a - b)
  if (rule.bySetPos.length) {
    days = rule.bySetPos
      .map((p) => (p > 0 ? days[p - 1] : days[days.length + p]))
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b)
  }
  return days
}

/** No máximo tantos passos ao abrir uma repetição (uma regra estranha não trava o app). */
const MAX_STEPS = 20000

/**
 * As datas de parede de uma regra a partir do início, em ordem, até `untilDay` (número do dia)
 * ou até acabar o COUNT. O próprio início é a primeira, como manda a RFC.
 */
function* ruleDates(
  rule: Rule,
  start: Wall,
  untilDay: number
): Generator<{ y: number; m: number; d: number }> {
  const startDay = dayNumber(start.y, start.m, start.d)
  let steps = 0
  if (rule.freq === 'DAILY') {
    for (let n = startDay; n <= untilDay && steps < MAX_STEPS; n += rule.interval, steps++) {
      const date = fromDayNumber(n)
      if (rule.byMonth.length && !rule.byMonth.includes(date.m)) continue
      if (
        rule.byMonthDay.length &&
        !monthDays({ ...rule, byDay: [], bySetPos: [] }, date.y, date.m, date.d).includes(date.d)
      )
        continue
      if (rule.byDay.length && !rule.byDay.some((b) => b.day === weekday(date.y, date.m, date.d)))
        continue
      yield date
    }
  } else if (rule.freq === 'WEEKLY') {
    // Semanas começando na segunda (WKST=MO, o padrão).
    const monday = startDay - ((weekday(start.y, start.m, start.d) + 6) % 7)
    const days = rule.byDay.length
      ? [...new Set(rule.byDay.map((b) => (b.day + 6) % 7))].sort((a, b) => a - b)
      : [(weekday(start.y, start.m, start.d) + 6) % 7]
    for (
      let week = monday;
      week <= untilDay && steps < MAX_STEPS;
      week += 7 * rule.interval, steps++
    ) {
      for (const offset of days) {
        const n = week + offset
        if (n < startDay || n > untilDay) continue
        const date = fromDayNumber(n)
        if (rule.byMonth.length && !rule.byMonth.includes(date.m)) continue
        yield date
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let i = 0; steps < MAX_STEPS; i += rule.interval, steps++) {
      const total = start.y * 12 + (start.m - 1) + i
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      if (dayNumber(y, m, 1) > untilDay) return
      if (rule.byMonth.length && !rule.byMonth.includes(m)) continue
      for (const d of monthDays(rule, y, m, start.d)) {
        const n = dayNumber(y, m, d)
        if (n >= startDay && n <= untilDay) yield { y, m, d }
      }
    }
  } else {
    for (let y = start.y; steps < MAX_STEPS; y += rule.interval, steps++) {
      if (dayNumber(y, 1, 1) > untilDay) return
      const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b) : [start.m]
      for (const m of months) {
        for (const d of monthDays(rule, y, m, start.d)) {
          const n = dayNumber(y, m, d)
          if (n >= startDay && n <= untilDay) yield { y, m, d }
        }
      }
    }
  }
}

// ---- Eventos ------------------------------------------------------------------

function first(props: Prop[], name: string): Prop | undefined {
  return props.find((p) => p.name === name)
}

/** As datas de uma lista (EXDATE, RDATE), que podem vir separadas por vírgula. */
function dateList(props: Prop[], name: string, fallback: Zone): number[] {
  const out: number[] = []
  for (const prop of props.filter((p) => p.name === name)) {
    for (const value of prop.value.split(',')) {
      const when = parseWhen({ ...prop, value })
      if (when) out.push(wallToInstant(when.wall, when.allDay ? fallback : when.zone))
    }
  }
  return out
}

interface Parsed {
  uid: string
  title: string
  location: string
  start: When
  /** A duração, em ms (num evento de dia inteiro, conta em dias de parede). */
  duration: number
  allDayDays: number
  rule: Rule | null
  exdates: Set<number>
  rdates: number[]
  recurrenceId: number | null
  cancelled: boolean
}

function parseEvent(props: Prop[]): Parsed | null {
  const start = parseWhen(first(props, 'DTSTART'))
  if (!start) return null
  const startAt = wallToInstant(start.wall, start.zone)
  let duration = 0
  let allDayDays = 1
  const end = parseWhen(first(props, 'DTEND'))
  const durationProp = first(props, 'DURATION')
  if (end) {
    if (start.allDay) {
      allDayDays = Math.max(
        1,
        dayNumber(end.wall.y, end.wall.m, end.wall.d) -
          dayNumber(start.wall.y, start.wall.m, start.wall.d)
      )
    } else {
      duration = Math.max(0, wallToInstant(end.wall, end.zone) - startAt)
    }
  } else if (durationProp) {
    const ms = parseDuration(durationProp.value) ?? 0
    if (start.allDay) allDayDays = Math.max(1, Math.round(ms / 86400000))
    else duration = Math.max(0, ms)
  }
  const rruleProp = first(props, 'RRULE')
  const recurrence = parseWhen(first(props, 'RECURRENCE-ID'))
  return {
    uid: first(props, 'UID')?.value ?? '',
    title: unescapeText(first(props, 'SUMMARY')?.value ?? '').trim() || '(sem título)',
    location: unescapeText(first(props, 'LOCATION')?.value ?? '').trim(),
    start,
    duration,
    allDayDays,
    rule: rruleProp ? parseRule(rruleProp.value, start.zone) : null,
    exdates: new Set(dateList(props, 'EXDATE', start.zone)),
    rdates: dateList(props, 'RDATE', start.zone),
    recurrenceId: recurrence
      ? wallToInstant(recurrence.wall, recurrence.allDay ? start.zone : recurrence.zone)
      : null,
    cancelled: first(props, 'STATUS')?.value.toUpperCase() === 'CANCELLED'
  }
}

/** Início e fim de uma ocorrência que começa nessa data de parede. */
function span(
  event: Parsed,
  date: { y: number; m: number; d: number }
): { start: number; end: number } {
  if (event.start.allDay) {
    const start = new Date(date.y, date.m - 1, date.d).getTime()
    const end = new Date(date.y, date.m - 1, date.d + event.allDayDays).getTime()
    return { start, end }
  }
  const start = wallToInstant({ ...event.start.wall, ...date }, event.start.zone)
  return { start, end: start + event.duration }
}

/**
 * As ocorrências dos eventos de um texto iCalendar que tocam a janela [from, to), em ordem de
 * início. `calendar` é o nome que vai em cada uma.
 */
export function occurrences(
  texts: string[],
  from: number,
  to: number,
  calendar: string
): Occurrence[] {
  const masters = new Map<string, Parsed>()
  const overrides: Parsed[] = []
  const singles: Parsed[] = []
  for (const text of texts) {
    for (const props of parseEvents(text)) {
      const event = parseEvent(props)
      if (!event) continue
      if (event.recurrenceId !== null) overrides.push(event)
      else if (event.uid && (event.rule || event.rdates.length)) masters.set(event.uid, event)
      else singles.push(event)
    }
  }
  // As ocorrências alteradas, por evento: o início original → a versão nova.
  const changed = new Map<string, Map<number, Parsed>>()
  for (const event of overrides) {
    if (!masters.has(event.uid)) {
      singles.push(event)
      continue
    }
    const byStart = changed.get(event.uid) ?? new Map<number, Parsed>()
    byStart.set(event.recurrenceId as number, event)
    changed.set(event.uid, byStart)
  }
  const out: Occurrence[] = []
  const push = (event: Parsed, start: number, end: number): void => {
    if (event.cancelled) return
    const touches = end > start ? start < to && end > from : start >= from && start < to
    if (touches) {
      out.push({
        uid: event.uid,
        title: event.title,
        start,
        end,
        allDay: event.start.allDay,
        location: event.location,
        calendar
      })
    }
  }
  for (const event of singles) {
    const { start, end } = span(event, event.start.wall)
    push(event, start, end)
  }
  // Uma folga de alguns dias no fim, por causa dos fusos e dos eventos longos.
  const untilDay = Math.floor(to / 86400000) + 2
  for (const event of masters.values()) {
    if (event.cancelled) continue
    const replaced = changed.get(event.uid)
    const starts: { start: number; end: number }[] = []
    if (event.rule) {
      let count = 0
      for (const date of ruleDates(event.rule, event.start.wall, untilDay)) {
        const { start, end } = span(event, date)
        if (event.rule.until !== null && start > event.rule.until) break
        count++
        if (event.rule.count !== null && count > event.rule.count) break
        starts.push({ start, end })
      }
    } else {
      starts.push(span(event, event.start.wall))
    }
    for (const extra of event.rdates) {
      const length = event.start.allDay ? event.allDayDays * 86400000 : event.duration
      starts.push({ start: extra, end: extra + length })
    }
    for (const { start, end } of starts) {
      if (event.exdates.has(start)) continue
      const override = replaced?.get(start)
      if (override) {
        const moved = span(override, override.start.wall)
        push(override, moved.start, moved.end)
      } else {
        push(event, start, end)
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
}

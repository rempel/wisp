// O clima do Início (Fase 97), pela Open-Meteo (sem chave nem conta). Desligado de início: só com
// uma cidade guardada nas configurações o Wisp fala com ela, e no máximo uma vez a cada 30
// minutos (o bloco pede quando está à vista; o resto vem da memória). A ferramenta weather do
// Claude (Fase 108) usa o mesmo, com a chance de chuva, para a sua cidade ou outra que ele pedir.

import type { WeatherPlace, WeatherReport, WeatherResult } from '../shared/ipc'

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
export const WEATHER_TTL_MS = 30 * 60_000
const TIMEOUT_MS = 10_000

type Fetch = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

async function getJson(fetcher: Fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const num = (value: unknown): number => (typeof value === 'number' ? value : NaN)

/** A previsão da Open-Meteo, no formato do bloco (lança se vier faltando algo). */
export function parseForecast(place: string, body: unknown, at: number): WeatherReport {
  const data = body as {
    current?: { temperature_2m?: unknown; weather_code?: unknown; wind_speed_10m?: unknown }
    daily?: {
      time?: unknown[]
      weather_code?: unknown[]
      temperature_2m_max?: unknown[]
      temperature_2m_min?: unknown[]
      precipitation_probability_max?: unknown[]
      precipitation_sum?: unknown[]
    }
  }
  const daily = data.daily
  const times = Array.isArray(daily?.time) ? daily.time : []
  const days = times.map((time, i) => {
    const [y, m, d] = String(time).split('-').map(Number)
    const rain = num(daily?.precipitation_probability_max?.[i])
    const rainMm = num(daily?.precipitation_sum?.[i])
    return {
      day: new Date(y, m - 1, d).getTime(),
      code: num(daily?.weather_code?.[i]),
      max: Math.round(num(daily?.temperature_2m_max?.[i])),
      min: Math.round(num(daily?.temperature_2m_min?.[i])),
      rain: Number.isFinite(rain) ? Math.round(rain) : null,
      rainMm: Number.isFinite(rainMm) ? Math.round(rainMm * 10) / 10 : null
    }
  })
  const now = Math.round(num(data.current?.temperature_2m))
  const code = num(data.current?.weather_code)
  if (!Number.isFinite(now) || !Number.isFinite(code) || !days.length) {
    throw new Error('a resposta veio incompleta')
  }
  const wind = num(data.current?.wind_speed_10m)
  return {
    place,
    now,
    code,
    max: days[0].max,
    min: days[0].min,
    rain: days[0].rain,
    wind: Number.isFinite(wind) ? Math.round(wind) : null,
    days: days.slice(1),
    at
  }
}

/** O tempo pelo código da OMM, em palavras. */
export function skyText(code: number): string {
  if (code === 0) return 'céu limpo'
  if (code <= 2) return 'poucas nuvens'
  if (code === 3) return 'nublado'
  if (code <= 48) return 'neblina'
  if (code <= 57) return 'garoa'
  if (code <= 67) return 'chuva'
  if (code <= 77) return 'neve'
  if (code <= 82) return 'pancadas de chuva'
  if (code <= 86) return 'neve'
  return 'trovoada'
}

/** A previsão em texto, para o Claude (a ferramenta weather). */
export function describeWeather(report: WeatherReport, days: number): string {
  const rain = (value: number | null | undefined, mm?: number | null): string =>
    value === null || value === undefined
      ? ''
      : `, chuva ${value}%${mm ? ` (${String(mm).replace('.', ',')} mm)` : ''}`
  const weekday = (at: number): string =>
    new Date(at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'numeric' })
  const lines = [
    `${report.place}, agora: ${report.now}°C, ${skyText(report.code)}${
      report.wind !== null && report.wind !== undefined ? `, vento ${report.wind} km/h` : ''
    }.`,
    `Hoje: máxima ${report.max}°C, mínima ${report.min}°C${rain(report.rain)}.`,
    ...report.days
      .slice(0, Math.max(0, days - 1))
      .map(
        (day) =>
          `${weekday(day.day)}: ${skyText(day.code)}, ${day.min}°C a ${day.max}°C${rain(day.rain, day.rainMm)}.`
      ),
    `(Open-Meteo, consultado às ${new Date(report.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.)`
  ]
  return lines.join('\n')
}

export class Weather {
  private cache: { key: string; report: WeatherReport } | null = null
  private pending: Promise<WeatherResult> | null = null
  private pendingKey = ''

  constructor(
    private readonly place: () => WeatherPlace | null,
    private readonly fetcher: Fetch = fetch as unknown as Fetch,
    private readonly now = Date.now
  ) {}

  async get(): Promise<WeatherResult> {
    const place = this.place()
    if (!place) return { state: 'off' }
    return this.forecast(place)
  }

  /** A previsão de um lugar (a sua cidade, ou outra que o Claude pediu), guardada por 30 minutos. */
  async forecast(place: WeatherPlace): Promise<WeatherResult> {
    const key = `${place.lat},${place.lon}`
    if (this.cache?.key === key && this.now() - this.cache.report.at < WEATHER_TTL_MS) {
      return { state: 'ok', report: this.cache.report }
    }
    if (this.pending && this.pendingKey === key) return this.pending
    this.pendingKey = key
    this.pending = this.fetch(place, key).finally(() => {
      this.pending = null
    })
    return this.pending
  }

  private async fetch(place: WeatherPlace, key: string): Promise<WeatherResult> {
    const query = new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lon),
      current: 'temperature_2m,weather_code,wind_speed_10m',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
      timezone: 'auto',
      forecast_days: '8'
    })
    try {
      const report = parseForecast(
        place.place,
        await getJson(this.fetcher, `${FORECAST}?${query}`),
        this.now()
      )
      this.cache = { key, report }
      return { state: 'ok', report }
    } catch (err) {
      // Sem rede: o último que veio serve, por velho que seja.
      if (this.cache?.key === key) return { state: 'ok', report: this.cache.report }
      return { state: 'error', message: (err as Error).message }
    }
  }

  /** Acha a cidade pelo nome (a primeira que a Open-Meteo devolver). */
  async find(name: string, language: string): Promise<WeatherPlace | { error: string }> {
    const query = new URLSearchParams({ name: name.trim(), count: '1', language, format: 'json' })
    try {
      const body = (await getJson(this.fetcher, `${GEOCODING}?${query}`)) as {
        results?: {
          name?: string
          admin1?: string
          country?: string
          latitude?: number
          longitude?: number
        }[]
      }
      const hit = body.results?.[0]
      if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
        return { error: 'not-found' }
      }
      const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ').slice(0, 100)
      return { place: label || name.trim(), lat: hit.latitude, lon: hit.longitude }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }
}

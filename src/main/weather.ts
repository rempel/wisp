// O clima do Início (Fase 97), pela Open-Meteo (sem chave nem conta). Desligado de início: só com
// uma cidade guardada nas configurações o Wisp fala com ela, e no máximo uma vez a cada 30
// minutos (o bloco pede quando está à vista; o resto vem da memória).

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
    current?: { temperature_2m?: unknown; weather_code?: unknown }
    daily?: {
      time?: unknown[]
      weather_code?: unknown[]
      temperature_2m_max?: unknown[]
      temperature_2m_min?: unknown[]
    }
  }
  const daily = data.daily
  const times = Array.isArray(daily?.time) ? daily.time : []
  const days = times.map((time, i) => {
    const [y, m, d] = String(time).split('-').map(Number)
    return {
      day: new Date(y, m - 1, d).getTime(),
      code: num(daily?.weather_code?.[i]),
      max: Math.round(num(daily?.temperature_2m_max?.[i])),
      min: Math.round(num(daily?.temperature_2m_min?.[i]))
    }
  })
  const now = Math.round(num(data.current?.temperature_2m))
  const code = num(data.current?.weather_code)
  if (!Number.isFinite(now) || !Number.isFinite(code) || !days.length) {
    throw new Error('a resposta veio incompleta')
  }
  return { place, now, code, max: days[0].max, min: days[0].min, days: days.slice(1, 4), at }
}

export class Weather {
  private cache: { key: string; report: WeatherReport } | null = null
  private pending: Promise<WeatherResult> | null = null

  constructor(
    private readonly place: () => WeatherPlace | null,
    private readonly fetcher: Fetch = fetch as unknown as Fetch,
    private readonly now = Date.now
  ) {}

  async get(): Promise<WeatherResult> {
    const place = this.place()
    if (!place) return { state: 'off' }
    const key = `${place.lat},${place.lon}`
    if (this.cache?.key === key && this.now() - this.cache.report.at < WEATHER_TTL_MS) {
      return { state: 'ok', report: this.cache.report }
    }
    this.pending ??= this.fetch(place, key).finally(() => {
      this.pending = null
    })
    return this.pending
  }

  private async fetch(place: WeatherPlace, key: string): Promise<WeatherResult> {
    const query = new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lon),
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '4'
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

// O clima para o Claude (Fase 108): a previsão com a chance de chuva, a ferramenta weather do
// servidor `desktop` (a sua cidade, outra pelo nome, nenhuma guardada), a linha no prompt e as
// tarefas que respondem só NADA (o aviso condicional que não tem o que avisar).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { describeWeather, parseForecast, skyText, Weather } from '../src/main/weather'
import { startDesktopServer } from '../src/main/mcp-server'
import { SAFE_TOOLS } from '../src/main/claude-settings'
import { APPEND_SYSTEM_PROMPT } from '../src/main/chat-conversation'
import { saysNothing } from '../src/main/heartbeat'
import type { WeatherPlace } from '../src/shared/ipc'

const AT = new Date(2026, 10, 20, 7, 30).getTime()
const FORECAST = {
  current: { temperature_2m: 23.6, weather_code: 3, wind_speed_10m: 14.2 },
  daily: {
    time: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
    weather_code: [3, 63, 61, 0],
    temperature_2m_max: [27.4, 24, 25, 29],
    temperature_2m_min: [19, 18.4, 18, 20],
    precipitation_probability_max: [20, 85, 60, 5],
    precipitation_sum: [0, 12.36, 4, 0]
  }
}

test('clima: a previsão com a chance de chuva e o vento, em texto para o Claude', () => {
  const report = parseForecast('Recife, Pernambuco, Brasil', FORECAST, AT)
  assert.equal(report.rain, 20)
  assert.equal(report.wind, 14)
  assert.equal(report.days.length, 3)
  assert.deepEqual(report.days[0], {
    day: new Date(2026, 10, 21).getTime(),
    code: 63,
    max: 24,
    min: 18,
    rain: 85,
    rainMm: 12.4
  })
  const text = describeWeather(report, 2)
  assert.match(text, /^Recife, Pernambuco, Brasil, agora: 24°C, nublado, vento 14 km\/h\./)
  assert.match(text, /Hoje: máxima 27°C, mínima 19°C, chuva 20%\./)
  assert.match(text, /sábado, 21\/11: chuva, 18°C a 24°C, chuva 85% \(12,4 mm\)\./)
  assert.doesNotMatch(text, /domingo/, 'só os dias pedidos')
  assert.equal(skyText(95), 'trovoada')
  // Sem os campos de chuva (uma resposta antiga), sem a chuva no texto.
  const old = parseForecast(
    'X',
    { ...FORECAST, daily: { ...FORECAST.daily, precipitation_probability_max: undefined } },
    AT
  )
  assert.equal(old.days[0].rain, null)
})

test('clima: a ferramenta weather pela sua cidade, por outra e sem nenhuma', async () => {
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const urls: string[] = []
  const weather = new Weather(
    () => null,
    async (url) => {
      urls.push(url)
      const body = url.includes('geocoding')
        ? url.includes('Lugarnenhum')
          ? { results: [] }
          : {
              results: [
                {
                  name: 'Campinas',
                  admin1: 'São Paulo',
                  country: 'Brasil',
                  latitude: -22.9,
                  longitude: -47.06
                }
              ]
            }
        : FORECAST
      return { ok: true, status: 200, json: async () => body }
    },
    () => AT
  )
  let home: WeatherPlace | null = { place: 'Recife, Pernambuco, Brasil', lat: -8.05, lon: -34.9 }
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    weather: { weather: () => weather, home: () => home }
  })
  try {
    const desktop = JSON.parse(readFileSync(server.configFor('c1'), 'utf8')).mcpServers.desktop
    const call = async (args: unknown) => {
      const res = await fetch(desktop.url, {
        method: 'POST',
        headers: {
          ...desktop.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'weather', arguments: args }
        })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body).result as {
        isError?: boolean
        content: { text: string }[]
      }
    }
    const mine = await call({})
    assert.equal(mine.isError, undefined)
    assert.match(mine.content[0].text, /^Recife/)
    assert.match(urls[0], /latitude=-8\.05/)
    const other = await call({ cidade: 'Campinas', dias: 1 })
    assert.match(other.content[0].text, /^Campinas, São Paulo, Brasil, agora/)
    assert.doesNotMatch(other.content[0].text, /sábado/)
    assert.match((await call({ cidade: 'Lugarnenhum' })).content[0].text, /Não achei a cidade/)
    home = null
    const none = await call({})
    assert.equal(none.isError, true)
    assert.match(none.content[0].text, /não guardou uma cidade/)
  } finally {
    server.close()
  }
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__weather'))
  assert.match(APPEND_SYSTEM_PROMPT, /ferramenta weather/)
})

test('clima: a tarefa que responde só NADA não entrega nada', () => {
  assert.equal(saysNothing('NADA'), true)
  assert.equal(saysNothing('  nada. '), true)
  assert.equal(saysNothing('**NADA**'), true)
  assert.equal(saysNothing(''), false, 'vazia é erro, não silêncio')
  assert.equal(saysNothing('Nada de sol: vai chover 85% amanhã.'), false)
})

// O painel de uso (Fase 49): as respostas dos .jsonl do Claude Code somadas por dia, projeto e
// modelo (cada resposta uma vez, mesmo gravada em várias linhas), o custo pela tabela de preços
// (a escrita do cache de 5 minutos e a de 1 hora com o preço de cada uma), os modelos sem preço,
// os arquivos de fora do período e o CSV.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { costOf, parseUsageLine, priceOf, usageCsv, usageReport } from '../src/main/usage-report'
import { byDay, groupBy } from '../src/renderer/chat/usage-data'

const root = join(HOME, 'claude-uso', 'projects')
const now = new Date(2026, 10, 6, 12, 0, 0)
const at = (daysAgo: number): string => new Date(2026, 10, 6 - daysAgo, 10, 0, 0).toISOString()

const line = (o: {
  id: string
  model: string
  when: string
  cwd: string
  input?: number
  output?: number
  write?: number
  write1h?: number
  read?: number
}): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: o.when,
    cwd: o.cwd,
    requestId: `req_${o.id}`,
    message: {
      id: `msg_${o.id}`,
      model: o.model,
      usage: {
        input_tokens: o.input ?? 0,
        output_tokens: o.output ?? 0,
        cache_creation_input_tokens: o.write ?? 0,
        cache_read_input_tokens: o.read ?? 0,
        cache_creation: { ephemeral_1h_input_tokens: o.write1h ?? 0, ephemeral_5m_input_tokens: 0 }
      }
    }
  })

test('uso: os preços pelo prefixo do modelo', () => {
  assert.equal(priceOf('claude-opus-5-5')?.input, 4)
  assert.equal(priceOf('claude-opus-5')?.input, 5)
  assert.equal(priceOf('claude-sonnet-4-5-20250929')?.output, 15)
  assert.equal(priceOf('claude-haiku-5-5')?.input, 0.1)
  assert.equal(priceOf('anthropic/claude-x'), null)
  assert.equal(priceOf('claude-opus-55'), null)
  // 1 mi de entrada (4) + 1 mi de saída (20) + 1 mi de escrita de 1 h (8) + 1 mi lidos (0,2).
  const cost = costOf('claude-opus-5-5', {
    input: 1e6,
    output: 1e6,
    cacheWrite5m: 0,
    cacheWrite1h: 1e6,
    cacheRead: 1e6
  })
  assert.ok(Math.abs((cost ?? 0) - 32.2) < 1e-9, String(cost))
  assert.equal(parseUsageLine('{"type":"user"}'), null)
  assert.equal(parseUsageLine('não é json "usage"'), null)
})

test('uso: soma por dia, projeto e modelo, cada resposta uma vez', async () => {
  const app = join(root, '-home-eu-app')
  const site = join(root, '-home-eu-site')
  mkdirSync(join(app, 'sessao', 'subagents'), { recursive: true })
  mkdirSync(site, { recursive: true })
  const first = line({
    id: 'a',
    model: 'claude-opus-5-5',
    when: at(0),
    cwd: '/home/eu/app',
    input: 1000,
    output: 500,
    write: 2000,
    write1h: 2000,
    read: 10000
  })
  // A mesma resposta em duas linhas (dois blocos): conta uma vez.
  writeFileSync(
    join(app, 's1.jsonl'),
    [first, first, '{"type":"user","message":{}}', ''].join('\n')
  )
  // Um subagente, na pasta de dentro.
  writeFileSync(
    join(app, 'sessao', 'subagents', 'agent-1.jsonl'),
    line({
      id: 'b',
      model: 'claude-haiku-5-5',
      when: at(0),
      cwd: '/home/eu/app',
      input: 100,
      output: 100
    }) + '\n'
  )
  writeFileSync(
    join(site, 's2.jsonl'),
    [
      line({
        id: 'c',
        model: 'claude-sonnet-5-5',
        when: at(1),
        cwd: '/home/eu/site',
        output: 1000
      }),
      line({ id: 'd', model: 'modelo-de-fora', when: at(1), cwd: '/home/eu/site', output: 10 }),
      line({
        id: 'e',
        model: 'claude-sonnet-5-5',
        when: at(40),
        cwd: '/home/eu/site',
        output: 99999
      })
    ].join('\n')
  )
  // Um arquivo antigo (mudado há 60 dias) nem é lido.
  const old = join(site, 'velho.jsonl')
  writeFileSync(
    old,
    line({ id: 'f', model: 'claude-opus-5-5', when: at(60), cwd: '/x', output: 5 })
  )
  const sixty = new Date(2026, 8, 7).getTime() / 1000
  utimesSync(old, sixty, sixty)

  const report = await usageReport(30, [root], now)
  assert.equal(report.days, 30)
  assert.equal(report.files, 3)
  const key = (r: { day: string; project: string; model: string }): string =>
    `${r.day} ${r.project} ${r.model}`
  assert.deepEqual(report.rows.map(key), [
    `${report.rows[0].day} app claude-haiku-5-5`,
    `${report.rows[0].day} app claude-opus-5-5`,
    `${report.rows[2].day} site claude-sonnet-5-5`,
    `${report.rows[2].day} site modelo-de-fora`
  ])
  const opus = report.rows[1]
  assert.deepEqual(
    [opus.input, opus.output, opus.cacheWrite, opus.cacheRead],
    [1000, 500, 2000, 10000]
  )
  // 1000×4 + 500×20 + 2000×8 + 10000×0,2 = 32000 por milhão.
  assert.ok(Math.abs((opus.cost ?? 0) - 0.032) < 1e-9, String(opus.cost))
  assert.equal(report.rows[3].cost, null)
  assert.deepEqual(report.unknownModels, ['modelo-de-fora'])

  // As contas da tela.
  const projects = groupBy(report.rows, 'project')
  assert.deepEqual(
    projects.map((p) => p.name),
    ['app', 'site']
  )
  assert.equal(projects[1].cost, null)
  const days = byDay(report, 'tokens')
  assert.equal(days.length, 30)
  assert.equal(days.at(-1)?.value, 1000 + 500 + 2000 + 10000 + 200)

  const csv = usageCsv(report).trim().split('\n')
  assert.equal(csv[0], 'dia,projeto,modelo,entrada,saida,cache_escrita,cache_leitura,custo_usd')
  assert.equal(csv.length, 5)
  assert.match(csv[2], /,app,claude-opus-5-5,1000,500,2000,10000,0\.0320$/)
  assert.match(csv[4], /,modelo-de-fora,0,10,0,0,$/)
})

// O painel de uso (Fase 49): os tokens e o custo estimado dos últimos dias, por dia (o gráfico),
// por projeto e por modelo, lidos dos .jsonl do Claude Code na sua máquina; e o CSV.
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { UsageReport } from '../../shared/ipc'
import { formatTokens } from '../../shared/format'
import { byDay, groupBy, money, tokensOf } from './usage-data'
import type { Group } from './usage-data'
import { t } from '../../shared/i18n'

const PERIODS = [7, 30, 90] as const

function Bars({
  days,
  measure
}: {
  days: { day: string; value: number }[]
  measure: 'cost' | 'tokens'
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const width = 600
  const height = 140
  const max = Math.max(...days.map((d) => d.value), 0)
  const step = width / days.length
  const bar = Math.max(2, step - 2)
  const label = (value: number): string => (measure === 'cost' ? money(value) : formatTokens(value))
  const shown = hover !== null ? days[hover] : null
  return (
    <figure className="spend-chart">
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        role="img"
        aria-label={measure === 'cost' ? t('Custo estimado por dia') : t('Tokens por dia')}
        onMouseLeave={() => setHover(null)}
      >
        {[0.5, 1].map((f) => (
          <line
            key={f}
            className="spend-grid"
            x1={0}
            x2={width}
            y1={height - height * f}
            y2={height - height * f}
          />
        ))}
        <line className="spend-axis" x1={0} x2={width} y1={height} y2={height} />
        {days.map((d, i) => {
          const h = max > 0 ? Math.max(d.value > 0 ? 2 : 0, (d.value / max) * (height - 6)) : 0
          const x = i * step + (step - bar) / 2
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect className="spend-hit" x={i * step} y={0} width={step} height={height} />
              {h > 0 && (
                <path
                  className={`spend-bar${hover === i ? ' on' : ''}`}
                  d={`M${x},${height} V${height - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, bar / 2)},-${Math.min(4, h)} H${x + bar - Math.min(4, bar / 2)} q${Math.min(4, bar / 2)},0 ${Math.min(4, bar / 2)},${Math.min(4, h)} V${height} Z`}
                />
              )}
            </g>
          )
        })}
        <text className="spend-tick" x={0} y={height + 14}>
          {days[0]?.day.slice(5)}
        </text>
        <text className="spend-tick" x={width} y={height + 14} textAnchor="end">
          {days.at(-1)?.day.slice(5)}
        </text>
      </svg>
      <figcaption className="spend-tip" aria-live="polite">
        {shown
          ? `${shown.day}: ${label(shown.value)}`
          : t('Máximo num dia: {value}', { value: label(max) })}
      </figcaption>
      <table className="sr-only">
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th>{d.day}</th>
              <td>{label(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function GroupTable({ title, groups }: { title: string; groups: Group[] }): JSX.Element {
  return (
    <table className="spend-table">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">{t('Nome')}</th>
          <th scope="col">{t('Tokens')}</th>
          <th scope="col">{t('Saída')}</th>
          <th scope="col">{t('Custo')}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.name}>
            <th scope="row">{group.name}</th>
            <td>{formatTokens(group.tokens)}</td>
            <td>{formatTokens(group.output)}</td>
            <td>{money(group.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function UsageView(): JSX.Element {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    void window.wisp.usage.report(days).then((next) => {
      if (!alive) return
      setReport(next)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [days])

  const view = useMemo(() => {
    if (!report) return null
    const total = report.rows.reduce(
      (sum, row) => ({
        tokens: sum.tokens + tokensOf(row),
        output: sum.output + row.output,
        cache: sum.cache + row.cacheRead,
        cost: sum.cost + (row.cost ?? 0)
      }),
      { tokens: 0, output: 0, cache: 0, cost: 0 }
    )
    const priced = report.rows.some((row) => row.cost !== null && row.cost > 0)
    return {
      total,
      measure: (priced ? 'cost' : 'tokens') as 'cost' | 'tokens',
      projects: groupBy(report.rows, 'project'),
      models: groupBy(report.rows, 'model')
    }
  }, [report])

  const exportCsv = (): void => {
    setNote(null)
    void window.wisp.usage.export(days).then((result) => {
      if (!result) return
      setNote(
        result.ok
          ? { ok: true, text: t('Exportado em {path}.', { path: result.path }) }
          : { ok: false, text: result.message }
      )
    })
  }

  return (
    <div className="settings spend-view">
      <div className="spend-head">
        <div className="spend-periods" role="group" aria-label={t('Período')}>
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              className={`settings-button${period === days ? ' active' : ''}`}
              aria-pressed={period === days}
              onClick={() => {
                setLoading(true)
                setDays(period)
              }}
            >
              {t('{count} dias', { count: period })}
            </button>
          ))}
        </div>
        <button type="button" className="settings-button" onClick={exportCsv} disabled={!report}>
          {t('Exportar CSV')}
        </button>
      </div>
      {note && (
        <small className={note.ok ? 'settings-hint' : 'settings-error'} role="status">
          {note.text}
        </small>
      )}
      {loading && !report ? (
        <p className="settings-hint">{t('Lendo as sessões do Claude Code…')}</p>
      ) : !report || !view || report.rows.length === 0 ? (
        <p className="settings-hint">
          {t(
            'Nenhuma resposta do Claude Code nesse período (as sessões ficam em ~/.claude/projects).'
          )}
        </p>
      ) : (
        <>
          <div className="spend-tiles">
            <div className="spend-tile">
              <strong>{money(view.total.cost)}</strong>
              <small>{t('custo estimado pela API')}</small>
            </div>
            <div className="spend-tile">
              <strong>{formatTokens(view.total.tokens)}</strong>
              <small>{t('tokens no total')}</small>
            </div>
            <div className="spend-tile">
              <strong>{formatTokens(view.total.output)}</strong>
              <small>{t('tokens de saída')}</small>
            </div>
            <div className="spend-tile">
              <strong>
                {view.total.tokens
                  ? `${Math.round((view.total.cache / view.total.tokens) * 100)}%`
                  : '—'}
              </strong>
              <small>{t('lidos do cache')}</small>
            </div>
          </div>
          <Bars days={byDay(report, view.measure)} measure={view.measure} />
          <GroupTable title={t('Por projeto')} groups={view.projects} />
          <GroupTable title={t('Por modelo')} groups={view.models} />
          <small className="settings-hint">
            {t(
              'O custo é o que essas respostas custariam pela API da Anthropic (os preços de novembro de 2026); numa assinatura, você não paga por token. Tudo vem dos arquivos do Claude Code nesta máquina, sem rede.'
            )}
            {report.unknownModels.length > 0 &&
              ' ' +
                t('Sem preço (fora do custo): {models}.', {
                  models: report.unknownModels.join(', ')
                })}
          </small>
        </>
      )}
    </div>
  )
}

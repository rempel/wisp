// A música e o clima (Fase 97). A música é o player em foco, o mesmo da ilha (MPRIS no Linux, o
// controle de mídia no Windows), lido de 5 em 5 segundos enquanto o bloco está à vista. O clima
// fica desligado até você dar a cidade; aí vem da Open-Meteo, no máximo de meia em meia hora.
import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import type { IslandMusic, WeatherResult } from '../../../shared/ipc'
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, SunIcon } from './icons-home'
import { useHome } from './context'
import { BlockHead, Empty, Meter } from './ui'
import { dateLocale, t } from '../../../shared/i18n'

const MUSIC_POLL_MS = 5000

export function MusicBlock(): JSX.Element {
  const [music, setMusic] = useState<IslandMusic | null | undefined>(undefined)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    let alive = true
    const read = (): void => {
      void window.wisp.home.music().then((value) => {
        if (alive) {
          setMusic(value)
          setClock(Date.now())
        }
      })
    }
    read()
    const timer = setInterval(read, MUSIC_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  const act = (action: Parameters<typeof window.wisp.home.musicAction>[0]): void => {
    void window.wisp.home.musicAction(action).then(() => window.wisp.home.music().then(setMusic))
  }
  const playing = music?.status === 'Playing'
  const position =
    music?.positionMs !== undefined
      ? music.positionMs + (playing ? Math.max(0, clock - music.at) : 0)
      : undefined
  return (
    <>
      <BlockHead icon={<MusicIcon />} title={t('Tocando agora')} />
      {music ? (
        <div className="music">
          {music.art ? (
            <img className="music-art" src={music.art} alt="" />
          ) : (
            <span className="music-art empty">
              <MusicIcon />
            </span>
          )}
          <div className="music-info">
            <strong className="ellipsis">{music.title ?? music.app}</strong>
            <small className="ellipsis">{music.artist ?? music.app}</small>
            {position !== undefined && music.durationMs ? (
              <Meter value={position / music.durationMs} label={t('Posição')} />
            ) : null}
            {music.canControl && (
              <span className="music-controls">
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t('Anterior')}
                  onClick={() => act({ type: 'previous' })}
                >
                  <PrevIcon />
                </button>
                <button
                  type="button"
                  className="icon-button play"
                  aria-label={playing ? t('Pausar') : t('Tocar')}
                  onClick={() => act({ type: 'toggle' })}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </button>
                {music.canNext && (
                  <button
                    type="button"
                    className="icon-button small"
                    aria-label={t('Próxima')}
                    onClick={() => act({ type: 'next' })}
                  >
                    <NextIcon />
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Empty>{music === undefined ? t('Carregando…') : t('Nenhum player tocando agora.')}</Empty>
      )}
    </>
  )
}

/** O tempo pelo código da OMM: o desenho e o nome. */
function sky(code: number): [string, string] {
  if (code === 0) return ['☀️', t('Céu limpo')]
  if (code <= 2) return ['🌤️', t('Poucas nuvens')]
  if (code === 3) return ['☁️', t('Nublado')]
  if (code <= 48) return ['🌫️', t('Neblina')]
  if (code <= 57) return ['🌦️', t('Garoa')]
  if (code <= 67) return ['🌧️', t('Chuva')]
  if (code <= 77) return ['❄️', t('Neve')]
  if (code <= 82) return ['🌧️', t('Pancadas de chuva')]
  if (code <= 86) return ['🌨️', t('Neve')]
  return ['⛈️', t('Trovoada')]
}

export function WeatherBlock(): JSX.Element {
  const { now } = useHome()
  const [result, setResult] = useState<WeatherResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    void window.wisp.home.weather().then((value) => {
      if (alive) setResult(value)
    })
    return () => {
      alive = false
    }
  }, [now, version])
  const save = (event: FormEvent): void => {
    event.preventDefault()
    void window.wisp.home.weatherPlace(city).then((answer) => {
      if ('error' in answer) {
        setError(
          answer.error === 'not-found'
            ? t('Não achei essa cidade.')
            : t('Não deu para procurar: {message}', { message: answer.error })
        )
        return
      }
      setError('')
      setEditing(false)
      setVersion(version + 1)
    })
  }
  const off = result?.state === 'off'
  const form = (
    <form className="inline-add" onSubmit={save}>
      <input
        autoFocus
        value={city}
        placeholder={t('A sua cidade')}
        aria-label={t('A sua cidade')}
        onChange={(event) => setCity(event.target.value)}
      />
      <button type="submit" className="btn primary small">
        {t('Usar')}
      </button>
      {error && <small className="error-text">{error}</small>}
    </form>
  )
  return (
    <>
      <BlockHead icon={<SunIcon />} title={t('Clima')}>
        {result?.state === 'ok' && (
          <button type="button" className="link" onClick={() => setEditing(!editing)}>
            {t('Trocar')}
          </button>
        )}
      </BlockHead>
      {off || editing ? (
        <>
          <Empty>
            {t(
              'O clima vem da Open-Meteo (sem conta). Só com uma cidade o Wisp consulta, e no máximo a cada 30 minutos.'
            )}
          </Empty>
          {form}
          {editing && (
            <button
              type="button"
              className="link"
              onClick={() =>
                void window.wisp.home.weatherPlace('').then(() => {
                  setEditing(false)
                  setVersion(version + 1)
                })
              }
            >
              {t('Desligar o clima')}
            </button>
          )}
        </>
      ) : result?.state === 'ok' ? (
        <div className="weather">
          <div className="weather-now">
            <span className="weather-sky" aria-hidden>
              {sky(result.report.code)[0]}
            </span>
            <strong>{result.report.now}°</strong>
            <span className="weather-text">
              {sky(result.report.code)[1]}
              <small>
                ↑ {result.report.max}° ↓ {result.report.min}° · {result.report.place.split(',')[0]}
              </small>
            </span>
          </div>
          <div className="weather-days">
            {result.report.days.slice(0, 3).map((day) => (
              <span key={day.day} title={sky(day.code)[1]}>
                <small>
                  {new Date(day.day)
                    .toLocaleDateString(dateLocale(), { weekday: 'short' })
                    .replace('.', '')}
                </small>
                <span aria-hidden>{sky(day.code)[0]}</span>
                <small>
                  {day.max}° / {day.min}°
                </small>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <Empty>
          {result?.state === 'error'
            ? t('Sem o clima agora ({message}).', { message: result.message })
            : t('Carregando…')}
        </Empty>
      )}
    </>
  )
}

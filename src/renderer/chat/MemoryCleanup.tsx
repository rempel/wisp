// O diário e a faxina na tela Memória (Fase 81): ligar e desligar a destilação, o que ela custou
// e a faxina da semana, que espera o seu OK com o diff do MEMORIA.md.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffView } from './DiffView'
import type { MemoryCleanupInfo } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'

export function MemoryCleanup({ onChanged }: { onChanged: () => void }): JSX.Element {
  const [info, setInfo] = useState<MemoryCleanupInfo | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.wisp.memory.cleanup('status').then((next) => {
      if (alive) setInfo(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const act = async (
    action: 'run' | 'accept' | 'discard' | `skill-${'accept' | 'discard'}:${string}`
  ): Promise<void> => {
    setBusy(true)
    try {
      setInfo(await window.wisp.memory.cleanup(action))
      if (action === 'accept') onChanged()
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (memoryDistill: boolean): Promise<void> => {
    await window.wisp.settings.set({ memoryDistill })
    setInfo(await window.wisp.memory.cleanup('status'))
  }

  const pending = info?.pending
  return (
    <section className="memory-file" aria-label={t('O diário e a faxina')}>
      <header>
        <div>
          <strong>{t('O diário e a faxina')}</strong>{' '}
          <small>
            {t(
              'o Haiku lê as conversas paradas e anota o diário e os fatos novos; uma vez por semana, sugere arrumar o MEMORIA.md'
            )}
          </small>
        </div>
        <button
          type="button"
          className="settings-button"
          disabled={busy || !info}
          onClick={() => void act('run')}
        >
          {busy && !pending ? t('Arrumando…') : t('Fazer a faxina agora')}
        </button>
      </header>
      {info && (
        <>
          <label className="memory-toggle">
            <input
              type="checkbox"
              checked={info.distill}
              onChange={(event) => void toggle(event.target.checked)}
            />{' '}
            {t('Destilar as conversas sozinho')}
          </label>
          <p className="settings-hint">
            {t(
              'Nos últimos 30 dias: {runs} vezes, US$ {cost} (o que custaria pela API; na assinatura, entra no uso do plano). {waiting} conversas esperando.',
              {
                runs: info.runs,
                cost: info.cost.toFixed(4),
                waiting: info.waiting
              }
            )}
          </p>
        </>
      )}
      {info?.message && (
        <p className="settings-hint" role="status">
          {info.message}
        </p>
      )}
      {pending && (
        <div className="agent-preview" role="region" aria-label={t('O que a faxina sugere')}>
          <strong>
            {t('A faxina de {when} sugere estas mudanças no MEMORIA.md:', {
              when: new Date(pending.at).toLocaleDateString(dateLocale())
            })}
          </strong>
          {pending.stale && (
            <p className="settings-error">
              {t('O arquivo mudou depois: grave só depois de rodar a faxina de novo.')}
            </p>
          )}
          <DiffView diff={pending.preview.diff} path={pending.preview.path} />
          <div className="rewind-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy || pending.stale}
              onClick={() => void act('accept')}
            >
              {t('Gravar')}
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => void act('discard')}
            >
              {t('Descartar')}
            </button>
          </div>
        </div>
      )}
      {info?.skills.map((skill) => (
        <div
          key={skill.name}
          className="agent-preview memory-skill"
          role="region"
          aria-label={t('Skill sugerida: {name}', { name: skill.name })}
        >
          <strong>{t('O Wisp sugere a skill /{name}', { name: skill.name })}</strong>
          <p>{skill.description}</p>
          {skill.reason && <p className="settings-hint">{skill.reason}</p>}
          <details>
            <summary>
              {skill.exists
                ? t('O SKILL.md (substitui o de agora, com um backup ao lado)')
                : t('O SKILL.md, em ~/.claude/skills/{name}', { name: skill.name })}
            </summary>
            <pre>{skill.text}</pre>
          </details>
          <div className="rewind-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => void act(`skill-accept:${skill.name}`)}
            >
              {t('Criar a skill')}
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => void act(`skill-discard:${skill.name}`)}
            >
              {t('Descartar')}
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

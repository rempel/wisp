import { useState } from 'react'
import type { JSX } from 'react'
import type { PortablePreview } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/**
 * Levar o Wisp junto (Fase 31): exportar as configurações, os prompts, as tarefas e, se quiser, o
 * histórico para um arquivo; e importar um, vendo antes o que muda.
 */
export function PortableSection(): JSX.Element {
  const [history, setHistory] = useState(false)
  const [preview, setPreview] = useState<PortablePreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const exportNow = async (): Promise<void> => {
    setMessage(null)
    setBusy(true)
    const result = await window.wisp.portable.export(history)
    setBusy(false)
    if (result) setMessage({ ok: result.ok, text: result.message })
  }
  const pick = async (): Promise<void> => {
    setMessage(null)
    setPreview(null)
    const result = await window.wisp.portable.pick()
    if (!result) return
    if ('error' in result) setMessage({ ok: false, text: result.error })
    else setPreview(result)
  }
  const importNow = async (): Promise<void> => {
    setBusy(true)
    const result = await window.wisp.portable.import()
    setBusy(false)
    setPreview(null)
    if (result) setMessage({ ok: result.ok, text: result.message })
  }

  const sensitive = preview?.changes.some((change) => change.sensitive) ?? false
  const nothing =
    preview &&
    !preview.changes.length &&
    !preview.prompts.added &&
    !preview.prompts.replaced &&
    !preview.tasks.added &&
    !preview.tasks.replaced &&
    !preview.conversations.added

  return (
    <div className="portable">
      <label className="portable-history">
        <input
          type="checkbox"
          checked={history}
          onChange={(event) => setHistory(event.target.checked)}
        />{' '}
        {t('Incluir o histórico das conversas')}
      </label>
      {preview ? (
        <div className="skill-preview portable-preview" role="dialog" aria-label={t('Importar')}>
          <strong>{t('Importar {file}', { file: preview.file })}</strong>
          <p className="settings-hint">
            {t('Exportado pelo Wisp {versao} em {em}.', {
              versao: preview.versao,
              em: preview.em.slice(0, 10)
            })}
          </p>
          {preview.changes.length > 0 && (
            <ul className="portable-changes">
              {preview.changes.map((change) => (
                <li key={change.key} className={change.sensitive ? 'sensitive' : ''}>
                  <code>{change.key}</code>: {change.before} → {change.after}
                </li>
              ))}
            </ul>
          )}
          {sensitive && (
            <p className="skill-tools">
              {t(
                'Os campos marcados mudam o que o Wisp roda ou lê na sua máquina (comandos, pastas, ferramentas liberadas): importe só um arquivo seu.'
              )}
            </p>
          )}
          <p className="settings-hint">
            {t(
              'Prompts novos: {pa}; trocados: {pr}. Tarefas novas: {ta}; trocadas: {tr}. Conversas novas: {ca}; as {cp} que já estão aqui ficam como estão.',
              {
                pa: preview.prompts.added,
                pr: preview.prompts.replaced,
                ta: preview.tasks.added,
                tr: preview.tasks.replaced,
                ca: preview.conversations.added,
                cp: preview.conversations.present
              }
            )}
          </p>
          {preview.ignored.length > 0 && (
            <p className="settings-hint">
              {t('Ficam de fora (de uma versão mais nova): {fields}.', {
                fields: preview.ignored.join(', ')
              })}
            </p>
          )}
          {nothing && <p className="settings-hint">{t('Nada a mudar: já está tudo aqui.')}</p>}
          <p className="settings-hint">
            {t('Antes, o config.json atual é copiado para um backup ao lado dele. Nada é apagado.')}
          </p>
          <div className="skill-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy || !!nothing}
              onClick={() => void importNow()}
            >
              {t('Importar')}
            </button>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {t('Cancelar')}
            </button>
          </div>
        </div>
      ) : (
        <div className="skill-actions">
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={() => void exportNow()}
          >
            {t('Exportar…')}
          </button>
          <button type="button" className="settings-button" onClick={() => void pick()}>
            {t('Importar…')}
          </button>
        </div>
      )}
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      <p className="settings-hint">
        {t(
          'O arquivo leva as configurações, os prompts salvos, as tarefas e, se marcado, as conversas. Nunca as chaves: a da OpenRouter e o pareamento do celular ficam no chaveiro do sistema (na máquina nova, é guardar de novo).'
        )}
      </p>
    </div>
  )
}

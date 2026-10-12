import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SkillInfo, SkillPreview } from '../../shared/ipc'

/**
 * As skills do Claude Code, nas configurações: as pessoais (~/.claude/skills) e as dos plugins.
 * Instalar copia a pasta de uma skill para as pessoais, depois de mostrar o que ela é; remover
 * manda para a lixeira. Quem usa as skills é o Claude Code, nas conversas novas.
 */
export function SkillsSection(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [preview, setPreview] = useState<SkillPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    void window.wisp.skills.list().then(setSkills)
  }, [])
  useEffect(refresh, [refresh])

  const pick = async (): Promise<void> => {
    setMessage(null)
    setPreview(null)
    const result = await window.wisp.skills.pick()
    if (!result) return
    if ('error' in result) setMessage({ ok: false, text: result.error })
    else setPreview(result)
  }
  const install = async (): Promise<void> => {
    setBusy(true)
    const result = await window.wisp.skills.install()
    setBusy(false)
    setPreview(null)
    setMessage({ ok: result.ok, text: result.message })
    refresh()
  }
  const remove = async (name: string): Promise<void> => {
    setBusy(true)
    const result = await window.wisp.skills.remove(name)
    setBusy(false)
    setMessage({ ok: result.ok, text: result.message })
    refresh()
  }

  return (
    <div className="skills">
      {skills && skills.length === 0 && (
        <p className="settings-hint">Nenhuma skill instalada ainda.</p>
      )}
      {skills && skills.length > 0 && (
        <ul className="skills-list">
          {skills.map((skill) => (
            <li key={`${skill.origin}:${skill.plugin ?? ''}:${skill.name}`} className="skill">
              <div className="skill-head">
                <strong>{skill.name}</strong>
                <span className="skill-origin">
                  {skill.origin === 'plugin' ? `plugin ${skill.plugin}` : 'pessoal'}
                </span>
                {skill.origin === 'personal' && (
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => void remove(skill.name)}
                    aria-label={`Remover ${skill.name}`}
                  >
                    Remover
                  </button>
                )}
              </div>
              {skill.description && <p className="skill-description">{skill.description}</p>}
              {skill.allowedTools && (
                <p className="skill-tools">Libera sem card: {skill.allowedTools}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <div className="skill-preview" role="dialog" aria-label="Instalar skill">
          <strong>Instalar “{preview.name}”?</strong>
          {preview.description && <p className="skill-description">{preview.description}</p>}
          <p className="settings-hint">
            {preview.files} {preview.files === 1 ? 'arquivo' : 'arquivos'}, copiados para
            ~/.claude/skills/{preview.name}.
          </p>
          {preview.allowedTools && (
            <p className="skill-tools">
              Ela libera sem card, enquanto é usada: {preview.allowedTools}. Instale só se você
              confia em quem a fez.
            </p>
          )}
          <div className="skill-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => void install()}
            >
              Instalar
            </button>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="skill-actions">
          <button type="button" className="settings-button" onClick={() => void pick()}>
            Instalar de uma pasta…
          </button>
          <button
            type="button"
            className="settings-button"
            onClick={() => window.wisp.skills.openFolder()}
          >
            Abrir a pasta das skills
          </button>
        </div>
      )}
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      <p className="settings-hint">
        O Claude usa uma skill sozinho quando ela combina com o pedido, ou quando você pede pelo
        nome. Valem nas conversas novas, pela assinatura e pela OpenRouter (as pessoais). Uma
        conversa aberta numa pasta também usa as skills do projeto (.claude/skills). Plugins se
        instalam pelo /plugin do Claude Code, no terminal.
      </p>
    </div>
  )
}

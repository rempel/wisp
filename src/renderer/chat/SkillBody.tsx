// O card de propor uma skill (Fase 86): onde ela vai ficar e o texto inteiro; se ela já existe,
// o diff do SKILL.md de agora para o novo.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffView } from './DiffView'
import { wholeFileDiff } from '../../shared/diff'
import { skillDraftOf, skillText } from '../../shared/skill-text'
import { t } from '../../shared/i18n'

export function SkillBody({ input }: { input: unknown }): JSX.Element {
  const draft = skillDraftOf(input)
  const name = 'error' in draft ? null : draft.name
  const [current, setCurrent] = useState<{ path: string; text: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    if (name) {
      void window.wisp.skills.text(name).then((value) => {
        if (alive) setCurrent(value)
      })
    }
    return () => {
      alive = false
    }
  }, [name])
  if ('error' in draft) return <p className="permission-explain">{draft.error}</p>
  const text = skillText(draft)
  return (
    <div className="skill-card">
      <p>
        <strong>/{draft.name}</strong> · {draft.description}
      </p>
      {current && (
        <p className="permission-explain">
          {current.text === null
            ? t('Cria {path}.', { path: current.path })
            : t('Muda {path} (a de antes ganha um backup ao lado):', { path: current.path })}
        </p>
      )}
      {current?.text ? (
        <DiffView diff={wholeFileDiff(current.text, text)} path={current.path} />
      ) : (
        <pre>{text}</pre>
      )}
    </div>
  )
}

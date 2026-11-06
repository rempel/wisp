// Os subagentes do Claude Code (Fase 50): a lista (os pessoais e os do projeto da conversa em
// foco), o formulário para criar e editar, a prévia com o diff antes de gravar e o apagar (para a
// lixeira). O main confere tudo de novo e só grava com o arquivo ainda como na prévia.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffView } from './DiffView'
import type { AgentInfo, AgentPreview, AgentScope, AgentSpec } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const MODELS: [string, string][] = [
  ['', t('O da conversa')],
  ['sonnet', 'Sonnet'],
  ['opus', 'Opus'],
  ['haiku', 'Haiku'],
  ['fable', 'Fable']
]

const EMPTY: AgentSpec = {
  scope: 'personal',
  name: '',
  description: '',
  prompt: '',
  tools: '',
  model: ''
}

const specOf = (agent: AgentInfo): AgentSpec => ({
  scope: agent.scope,
  name: agent.file,
  description: agent.description,
  prompt: agent.prompt,
  tools: agent.tools ?? '',
  model: agent.model === 'inherit' ? '' : (agent.model ?? '')
})

export function AgentsView({ folder }: { folder: string | null }): JSX.Element {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [editing, setEditing] = useState<{ spec: AgentSpec; existing: boolean } | null>(null)
  const [preview, setPreview] = useState<AgentPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const refresh = (): void => {
    void window.wisp.agents.list(folder).then(setAgents)
  }
  useEffect(() => {
    let alive = true
    void window.wisp.agents.list(folder).then((list) => {
      if (alive) setAgents(list)
    })
    return () => {
      alive = false
    }
  }, [folder])

  const set = (patch: Partial<AgentSpec>): void => {
    setPreview(null)
    setEditing((current) => current && { ...current, spec: { ...current.spec, ...patch } })
  }

  const showPreview = async (): Promise<void> => {
    if (!editing) return
    setMessage(null)
    const result = await window.wisp.agents.preview(editing.spec, folder)
    if ('error' in result) setMessage({ ok: false, text: result.error })
    else setPreview(result)
  }

  const save = async (): Promise<void> => {
    if (!editing || !preview) return
    const result = await window.wisp.agents.save(editing.spec, folder, preview.fingerprint)
    setMessage({ ok: result.ok, text: result.message })
    if (result.ok) {
      setEditing(null)
      setPreview(null)
      refresh()
    } else setPreview(null)
  }

  const remove = async (agent: AgentInfo): Promise<void> => {
    const result = await window.wisp.agents.remove(agent.scope, agent.file, folder)
    setConfirmRemove(null)
    setMessage({ ok: result.ok, text: result.message })
    refresh()
  }

  const scopeLabel = (scope: AgentScope): string =>
    scope === 'personal' ? t('seu') : t('deste projeto')

  return (
    <div className="settings agents-view">
      <p className="settings-hint">
        {t(
          'Os subagentes são ajudantes que o Claude chama sozinho para uma parte do trabalho (revisar código, escrever testes, pesquisar), cada um com o seu prompt, o seu modelo e as suas ferramentas. Os seus ficam em ~/.claude/agents; os do projeto, em .claude/agents da pasta da conversa.'
        )}
      </p>
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      {editing ? (
        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault()
            void showPreview()
          }}
        >
          <label>
            {t('Nome')}
            <input
              value={editing.spec.name}
              disabled={editing.existing}
              placeholder="revisor-de-codigo"
              onChange={(event) => set({ name: event.target.value.toLowerCase() })}
            />
          </label>
          <label>
            {t('Quando usar (a descrição que o Claude lê para escolher)')}
            <input
              value={editing.spec.description}
              placeholder={t('Revisa o código depois de uma mudança: bugs, segurança e clareza.')}
              onChange={(event) => set({ description: event.target.value })}
            />
          </label>
          <label>
            {t('O prompt do subagente')}
            <textarea
              rows={8}
              value={editing.spec.prompt}
              placeholder={t('Você é um revisor de código cuidadoso. Leia o diff e…')}
              onChange={(event) => set({ prompt: event.target.value })}
            />
          </label>
          <div className="agent-row">
            <label>
              {t('Modelo')}
              <select
                value={editing.spec.model}
                onChange={(event) => set({ model: event.target.value })}
              >
                {MODELS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Onde')}
              <select
                value={editing.spec.scope}
                disabled={editing.existing}
                onChange={(event) => set({ scope: event.target.value as AgentScope })}
              >
                <option value="personal">{t('Seus (todas as conversas)')}</option>
                <option value="project" disabled={!folder}>
                  {folder
                    ? t('Deste projeto ({folder})', { folder })
                    : t('Deste projeto (abra uma pasta)')}
                </option>
              </select>
            </label>
          </div>
          <label>
            {t('Ferramentas, separadas por vírgula (vazio: todas as da conversa)')}
            <input
              value={editing.spec.tools}
              placeholder="Read, Grep, Glob"
              onChange={(event) => set({ tools: event.target.value })}
            />
          </label>
          {preview && (
            <div className="agent-preview" role="region" aria-label={t('O que muda')}>
              <strong>
                {preview.unchanged
                  ? t('Nada muda em {path}.', { path: preview.path })
                  : preview.exists
                    ? t('Muda {path} (o de antes ganha um backup ao lado):', { path: preview.path })
                    : t('Cria {path}:', { path: preview.path })}
              </strong>
              {!preview.unchanged && <DiffView diff={preview.diff} path={preview.path} />}
            </div>
          )}
          <div className="rewind-actions">
            {preview && !preview.unchanged ? (
              <button type="button" className="settings-button" onClick={() => void save()}>
                {preview.exists ? t('Gravar') : t('Criar')}
              </button>
            ) : (
              <button type="submit" className="settings-button">
                {t('Ver o que muda')}
              </button>
            )}
            <button
              type="button"
              className="link"
              onClick={() => {
                setEditing(null)
                setPreview(null)
              }}
            >
              {t('Cancelar')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="settings-button agents-new"
          onClick={() => {
            setMessage(null)
            setEditing({ spec: { ...EMPTY }, existing: false })
          }}
        >
          {t('Novo subagente')}
        </button>
      )}
      {agents && agents.length === 0 && (
        <p className="settings-hint">{t('Nenhum subagente ainda.')}</p>
      )}
      {agents && agents.length > 0 && (
        <ul className="skills-list">
          {agents.map((agent) => (
            <li key={`${agent.scope}:${agent.file}`} className="skill agent">
              <div className="skill-head">
                <strong>{agent.name}</strong>
                <span className="skill-origin">{scopeLabel(agent.scope)}</span>
                {agent.model && <span className="skill-origin">{agent.model}</span>}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setMessage(null)
                    setPreview(null)
                    setEditing({ spec: specOf(agent), existing: true })
                  }}
                >
                  {t('Editar')}
                </button>
                {confirmRemove === `${agent.scope}:${agent.file}` ? (
                  <button type="button" className="link danger" onClick={() => void remove(agent)}>
                    {t('Mandar para a lixeira?')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setConfirmRemove(`${agent.scope}:${agent.file}`)}
                    aria-label={t('Apagar {name}', { name: agent.name })}
                  >
                    {t('Apagar')}
                  </button>
                )}
              </div>
              {agent.description && <p className="skill-description">{agent.description}</p>}
              {agent.tools && (
                <p className="skill-tools">
                  {t('Ferramentas:')} {agent.tools}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { JSX } from 'react'
import type { Settings, TaskResult } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'
import { formatAgo, formatReset } from '../../shared/format'
import { MAX_PROMPTS, MAX_TASKS, nextRun, TASK_TRIGGERS, variable } from '../../shared/prompts'
import type { SavedPrompt, ScheduledTask, TaskTrigger } from '../../shared/prompts'

// Os prompts salvos e as tarefas agendadas (Fase 26), nas configurações. Cada mudança grava a
// lista inteira (o config.json confere cada item); um item novo só entra quando está completo.

type SaveList = (patch: Partial<Settings>) => Promise<boolean>

/** Os dias da semana, de domingo a sábado, no idioma da interface. */
const WEEKDAYS = Array.from({ length: 7 }, (_, day) =>
  // 2023-01-01 foi um domingo.
  new Date(2023, 0, 1 + day).toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')
)
const WORKDAYS = [1, 2, 3, 4, 5]

const newId = (): string => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function PromptsSection({
  prompts,
  error,
  save
}: {
  prompts: SavedPrompt[]
  error?: string
  save: SaveList
}): JSX.Element {
  const [adding, setAdding] = useState<SavedPrompt | null>(null)
  const replace = (index: number, next: SavedPrompt | null): Promise<boolean> =>
    save({
      prompts: next
        ? prompts.map((item, i) => (i === index ? next : item))
        : prompts.filter((_, i) => i !== index)
    })
  return (
    <section className="settings-section automation">
      <h2>{t('Prompts salvos')}</h2>
      <small className="settings-hint">
        {t(
          'Pedidos prontos no menu da barra: digite / e o nome. O texto vai para a caixa, já com as variáveis preenchidas, para você revisar e mandar. Variáveis: {v1} (a pasta da conversa), {v2} (o que você copiou), {v3} e {v4}.',
          {
            v1: variable('pasta', 'folder'),
            v2: variable('copiado', 'clipboard'),
            v3: variable('data', 'date'),
            v4: variable('hora', 'time')
          }
        )}
      </small>
      {prompts.map((prompt, index) => (
        <PromptEditor
          key={`${index}-${prompt.name}`}
          value={prompt}
          onCommit={(next) => replace(index, next)}
          onRemove={() => void replace(index, null)}
        />
      ))}
      {adding ? (
        <PromptEditor
          value={adding}
          fresh
          onCommit={async (next) => {
            const ok = await save({ prompts: [...prompts, next] })
            if (ok) setAdding(null)
            return ok
          }}
          onRemove={() => setAdding(null)}
        />
      ) : (
        <button
          type="button"
          className="settings-button"
          disabled={prompts.length >= MAX_PROMPTS}
          onClick={() => setAdding({ name: '', text: '' })}
        >
          {t('Novo prompt')}
        </button>
      )}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </section>
  )
}

/** Um prompt: o nome e o texto. Um novo grava pelo botão; um que já existe, ao sair do campo. */
function PromptEditor({
  value,
  fresh = false,
  onCommit,
  onRemove
}: {
  value: SavedPrompt
  fresh?: boolean
  onCommit: (next: SavedPrompt) => Promise<boolean>
  onRemove: () => void
}): JSX.Element {
  const [name, setName] = useState(value.name)
  const [text, setText] = useState(value.text)
  // Mudou por fora (no arquivo): os campos acompanham.
  const [seen, setSeen] = useState(JSON.stringify(value))
  if (JSON.stringify(value) !== seen) {
    setSeen(JSON.stringify(value))
    setName(value.name)
    setText(value.text)
  }
  const next = (): SavedPrompt => ({ name: name.trim().toLowerCase(), text: text.trim() })
  const commit = (): void => {
    if (fresh) return
    const changed = next()
    if (changed.name !== value.name || changed.text !== value.text) void onCommit(changed)
  }
  return (
    <div className="automation-item">
      <div className="automation-head">
        <span className="automation-slash" aria-hidden>
          /
        </span>
        <input
          type="text"
          value={name}
          aria-label={t('Nome do prompt')}
          placeholder={t('nome')}
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
        />
        <button
          type="button"
          className="settings-button"
          onClick={onRemove}
          aria-label={fresh ? t('Cancelar') : t('Remover /{name}', { name: value.name })}
        >
          {fresh ? t('Cancelar') : t('Remover')}
        </button>
      </div>
      <textarea
        rows={3}
        value={text}
        aria-label={t('Texto do prompt')}
        placeholder={t('O que pedir ao Claude…')}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {fresh && (
        <button
          type="button"
          className="settings-button primary"
          disabled={!name.trim() || !text.trim()}
          onClick={() => void onCommit(next())}
        >
          {t('Guardar')}
        </button>
      )}
    </div>
  )
}

export function TasksSection({
  tasks,
  runs,
  error,
  save
}: {
  tasks: ScheduledTask[]
  runs: Record<string, number>
  error?: string
  save: SaveList
}): JSX.Element {
  const [adding, setAdding] = useState<ScheduledTask | null>(null)
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null)
  const replace = (index: number, next: ScheduledTask | null): Promise<boolean> =>
    save({
      scheduledTasks: next
        ? tasks.map((item, i) => (i === index ? next : item))
        : tasks.filter((_, i) => i !== index)
    })
  const runNow = async (task: ScheduledTask): Promise<void> => {
    const result: TaskResult = await window.wisp.settings.runTask(task.id)
    setMessage({
      id: task.id,
      text: result.ok ? t('Rodando numa aba nova, no modo Pedir.') : result.message
    })
  }
  return (
    <section className="settings-section automation">
      <h2>{t('Tarefas agendadas')}</h2>
      <small className="settings-hint">
        {t(
          'Um prompt que roda sozinho num horário ou quando algo acontece (uma revisão, um CI vermelho, um arquivo novo, a tela desbloqueada), numa aba nova, sempre no modo Pedir: o que mexer no computador espera o seu clique (ou vai para o celular, se ligado). Com o Wisp fechado na hora, a do horário roda quando ele abrir, até 2 horas depois; a de um evento roda no máximo uma vez a cada 5 minutos. Valem {v1}, {v2}, {v3} e {v4} (o que aconteceu); o que foi copiado, não.',
          {
            v1: variable('pasta', 'folder'),
            v2: variable('data', 'date'),
            v3: variable('hora', 'time'),
            v4: variable('evento', 'event')
          }
        )}
      </small>
      {tasks.map((task, index) => (
        <TaskEditor
          key={task.id}
          value={task}
          lastRun={runs[task.id] ?? null}
          message={message?.id === task.id ? message.text : null}
          onCommit={(next) => replace(index, next)}
          onRemove={() => void replace(index, null)}
          onRunNow={() => void runNow(task)}
        />
      ))}
      {adding ? (
        <TaskEditor
          value={adding}
          fresh
          lastRun={null}
          message={null}
          onCommit={async (next) => {
            const ok = await save({ scheduledTasks: [...tasks, next] })
            if (ok) setAdding(null)
            return ok
          }}
          onRemove={() => setAdding(null)}
        />
      ) : (
        <button
          type="button"
          className="settings-button"
          disabled={tasks.length >= MAX_TASKS}
          onClick={() =>
            setAdding({
              id: newId(),
              name: '',
              prompt: '',
              time: '09:00',
              days: WORKDAYS,
              folder: null,
              enabled: true
            })
          }
        >
          {t('Nova tarefa')}
        </button>
      )}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </section>
  )
}

/** Quando cada gatilho roda (Fase 44), como o editor mostra. */
const TRIGGER_LABELS: Record<TaskTrigger, () => string> = {
  time: () => t('No horário'),
  'pr-review': () => t('Quando chega uma revisão num PR seu (GitHub)'),
  'ci-failed': () => t('Quando o CI de um PR seu falha (GitHub)'),
  'new-file': () => t('Quando aparece um arquivo novo numa pasta'),
  unlock: () => t('Ao desbloquear a tela')
}

/** Uma tarefa: o nome, quando ela roda, a pasta e o prompt. */
function TaskEditor({
  value,
  fresh = false,
  lastRun,
  message,
  onCommit,
  onRemove,
  onRunNow
}: {
  value: ScheduledTask
  fresh?: boolean
  lastRun: number | null
  message: string | null
  onCommit: (next: ScheduledTask) => Promise<boolean>
  onRemove: () => void
  onRunNow?: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  // Mudou por fora (no arquivo, ou gravou e voltou): os campos acompanham.
  const [seen, setSeen] = useState(JSON.stringify(value))
  if (JSON.stringify(value) !== seen) {
    setSeen(JSON.stringify(value))
    setDraft(value)
  }
  const clean = (task: ScheduledTask): ScheduledTask => ({
    ...task,
    name: task.name.trim(),
    prompt: task.prompt.trim(),
    folder: task.folder?.trim() || null,
    ...(task.trigger === 'new-file' ? { watch: task.watch?.trim() || null } : { watch: undefined }),
    days: [...task.days].sort()
  })
  const commit = (task: ScheduledTask = draft): void => {
    if (fresh) return
    const next = clean(task)
    if (JSON.stringify(next) !== JSON.stringify(value)) void onCommit(next)
  }
  // Os botões e a hora gravam na hora; os textos, ao sair do campo.
  const change = (patch: Partial<ScheduledTask>, now = false): void => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (now) commit(next)
  }
  const upcoming = fresh ? null : nextRun(value, new Date())
  const trigger = draft.trigger ?? 'time'
  const timed = trigger === 'time'
  // O que falta para agendar: o horário pede um dia; o arquivo novo, a pasta.
  const ready =
    !!draft.name.trim() &&
    !!draft.prompt.trim() &&
    (timed ? draft.days.length > 0 : trigger !== 'new-file' || !!draft.watch?.trim())
  return (
    <div className={`automation-item${value.enabled || fresh ? '' : ' off'}`}>
      <div className="automation-head">
        <input
          type="text"
          value={draft.name}
          aria-label={t('Nome da tarefa')}
          placeholder={t('Nome da tarefa')}
          onChange={(event) => change({ name: event.target.value })}
          onBlur={() => commit()}
        />
        {!fresh && (
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            aria-label={t('Ligada')}
            className={`switch${draft.enabled ? ' on' : ''}`}
            onClick={() => change({ enabled: !draft.enabled }, true)}
          >
            <span className="switch-track" aria-hidden>
              <span className="switch-thumb" />
            </span>
          </button>
        )}
      </div>
      <select
        className="automation-trigger"
        value={trigger}
        aria-label={t('Quando a tarefa roda')}
        onChange={(event) => change({ trigger: event.target.value as TaskTrigger }, true)}
      >
        {TASK_TRIGGERS.map((item) => (
          <option key={item} value={item}>
            {TRIGGER_LABELS[item]()}
          </option>
        ))}
      </select>
      {trigger === 'new-file' && (
        <input
          type="text"
          value={draft.watch ?? ''}
          aria-label={t('Pasta acompanhada')}
          placeholder={t('A pasta acompanhada: ~/Downloads')}
          spellCheck={false}
          onChange={(event) => change({ watch: event.target.value })}
          onBlur={() => commit()}
        />
      )}
      {timed && (
        <div className="automation-when">
          <input
            type="time"
            value={draft.time}
            aria-label={t('Hora')}
            onChange={(event) => change({ time: event.target.value }, Boolean(event.target.value))}
          />
          <div className="automation-days" role="group" aria-label={t('Dias da semana')}>
            {WEEKDAYS.map((label, day) => {
              const on = draft.days.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  className={on ? 'on' : ''}
                  onClick={() =>
                    change(
                      { days: on ? draft.days.filter((d) => d !== day) : [...draft.days, day] },
                      true
                    )
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <input
        type="text"
        value={draft.folder ?? ''}
        aria-label={t('Pasta')}
        placeholder={t('Pasta (opcional): ~/projetos/site')}
        spellCheck={false}
        onChange={(event) => change({ folder: event.target.value })}
        onBlur={() => commit()}
      />
      <textarea
        rows={3}
        value={draft.prompt}
        aria-label={t('Prompt da tarefa')}
        placeholder={t('O que pedir ao Claude…')}
        onChange={(event) => change({ prompt: event.target.value })}
        onBlur={() => commit()}
      />
      <div className="automation-foot">
        {fresh ? (
          <>
            <button
              type="button"
              className="settings-button primary"
              disabled={!ready}
              onClick={() => void onCommit(clean(draft))}
            >
              {t('Agendar')}
            </button>
            <button type="button" className="settings-button" onClick={onRemove}>
              {t('Cancelar')}
            </button>
          </>
        ) : (
          <>
            <small className="settings-hint">
              {!value.enabled
                ? t('Desligada')
                : !timed
                  ? TRIGGER_LABELS[trigger]()
                  : upcoming
                    ? t('Próxima: {v1}', { v1: formatReset(upcoming.getTime() / 1000) })
                    : t('Nenhum dia marcado')}
              {lastRun ? ` · ${t('rodou {v1}', { v1: formatAgo(lastRun) })}` : ''}
            </small>
            <button type="button" className="settings-button" onClick={onRunNow}>
              {t('Rodar agora')}
            </button>
            <button
              type="button"
              className="settings-button"
              onClick={onRemove}
              aria-label={t('Remover a tarefa {name}', { name: value.name })}
            >
              {t('Remover')}
            </button>
          </>
        )}
      </div>
      {message && (
        <small className="settings-hint" role="status">
          {message}
        </small>
      )}
    </div>
  )
}

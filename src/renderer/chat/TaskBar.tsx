import type { JSX } from 'react'
import type { TaskInfo } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** As tarefas em segundo plano (um servidor rodando, um subagente): a primeira e quantas mais. */
export function TaskBar({ tasks }: { tasks: TaskInfo[] }): JSX.Element {
  const [first, ...rest] = tasks
  return (
    <div
      className="task-bar"
      role="status"
      title={tasks.map((task) => task.description).join('\n')}
    >
      <span className="spinner" />
      <span>
        {t('Em segundo plano:')} {first.description || t('uma tarefa')}
        {rest.length > 0 ? ` (+${rest.length})` : ''}
      </span>
    </div>
  )
}

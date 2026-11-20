// O card de agendar uma tarefa (Fase 83): o nome, o horário em palavras, o prompt, a pasta e
// para onde vai o resultado, do mesmo jeito que a tarefa vai ser gravada.
import type { JSX } from 'react'
import { describeSchedule } from '../../shared/prompts'
import type { TaskDelivery } from '../../shared/prompts'
import { taskFromInput } from '../../shared/schedule-input'
import { t } from '../../shared/i18n'

const DELIVERY: Record<TaskDelivery, () => string> = {
  main: () => t('a conversa Wisp'),
  notify: () => t('a notificação'),
  telegram: () => t('o Telegram'),
  mascot: () => t('o mascote')
}

export function ScheduleBody({ input }: { input: unknown }): JSX.Element {
  const task = taskFromInput(input, new Date())
  if ('error' in task) {
    return <p className="permission-explain">{task.error}</p>
  }
  return (
    <div className="schedule-card">
      <p>
        <strong>{task.name}</strong> · {describeSchedule(task)}
      </p>
      <pre>{task.prompt}</pre>
      <p className="permission-explain">
        {task.folder ? t('Na pasta {folder}.', { folder: task.folder }) + ' ' : ''}
        {t('Roda numa aba nova, no modo Pedir. O resultado vai para {where}.', {
          where: (task.deliver ?? []).map((item) => DELIVERY[item]()).join(', ')
        })}
      </p>
    </div>
  )
}

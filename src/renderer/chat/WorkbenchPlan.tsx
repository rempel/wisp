// A aba Plano da bancada (Fase 76): o plano que o Claude apresentou no modo Planejar e a lista
// de passos dele, marcados conforme ele avança, à vista durante o trabalho.
import type { JSX } from 'react'
import { CheckIcon } from './icons'
import { Markdown } from './Markdown'
import type { Item } from './state'
import { latestPlan, latestTodos, planProgress } from '../../shared/plan'
import { t } from '../../shared/i18n'

const PLAN_STATUS = {
  waiting: () => t('esperando você aceitar'),
  accepted: () => t('aceito'),
  refused: () => t('recusado')
}

export function PlanTab({ items }: { items: Item[] }): JSX.Element {
  const todos = latestTodos(items)
  const plan = latestPlan(items)
  const { done, total } = planProgress(todos)
  return (
    <div className="workbench-body workbench-plan" role="tabpanel" aria-label={t('Plano')}>
      {!plan && !total ? (
        <div className="workbench-empty">
          <strong>{t('Nenhum plano ainda')}</strong>
          <span>
            {t(
              'No modo Planejar (Shift+Tab na caixa de texto), o Claude monta um plano antes de mexer em algo. Ele aparece aqui, e a lista de passos vai sendo marcada conforme o trabalho anda.'
            )}
          </span>
        </div>
      ) : (
        <div className="workbench-plan-scroll">
          {total > 0 && (
            <section aria-label={t('Passos')}>
              <header className="workbench-plan-head">
                <strong>{t('Passos')}</strong>
                <span>{t('{done} de {total}', { done, total })}</span>
              </header>
              <div
                className="workbench-plan-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
              >
                <span style={{ width: `${(done / total) * 100}%` }} />
              </div>
              <ol className="workbench-plan-steps">
                {todos.map((todo, index) => (
                  <li key={`${index}-${todo.text}`} className={`step-${todo.status}`}>
                    <span className="workbench-plan-mark" aria-hidden>
                      {todo.status === 'completed' && <CheckIcon />}
                    </span>
                    <span>{todo.text}</span>
                    <span className="sr-only">
                      {todo.status === 'completed'
                        ? t('feito')
                        : todo.status === 'in_progress'
                          ? t('em andamento')
                          : t('a fazer')}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {plan && (
            <section aria-label={t('Plano')}>
              <header className="workbench-plan-head">
                <strong>{t('Plano')}</strong>
                <span className={`plan-${plan.status}`}>{PLAN_STATUS[plan.status]()}</span>
              </header>
              <div className="msg assistant workbench-plan-text">
                <Markdown text={plan.text} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

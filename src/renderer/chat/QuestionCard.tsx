import { useState } from 'react'
import type { JSX } from 'react'
import type { Item } from './state'
import { useArmed } from './useArmed'
import { t } from '../../shared/i18n'

type PermissionItem = Extract<Item, { kind: 'permission' }>

interface Option {
  label: string
  description: string
}

interface Question {
  question: string
  header: string
  multiSelect: boolean
  options: Option[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** As perguntas do pedido do AskUserQuestion, ou null se o formato não for o esperado. */
function parseQuestions(input: unknown): Question[] | null {
  const questions = (input as { questions?: unknown } | null)?.questions
  if (!Array.isArray(questions) || questions.length === 0) return null
  const parsed = questions.map((item: Record<string, unknown> | null) => ({
    question: text(item?.question),
    header: text(item?.header),
    multiSelect: item?.multiSelect === true,
    options: Array.isArray(item?.options)
      ? item.options
          .map((option: Record<string, unknown> | null) => {
            const label = text(option?.label)
            const description = text(option?.description)
            // Descrição que só repete o rótulo não acrescenta nada.
            const same = description.trim().toLowerCase() === label.trim().toLowerCase()
            return { label, description: same ? '' : description }
          })
          .filter((option) => option.label)
      : []
  }))
  return parsed.every((q) => q.question) ? parsed : null
}

const RESULT: Record<string, string> = {
  answered: t('Respondida'),
  deny: t('Pulada'),
  cancelled: t('Cancelada')
}

/**
 * Card de pergunta do Claude (ferramenta AskUserQuestion): um botão por opção, marcação múltipla
 * quando a pergunta pede, um campo para outra resposta e Pular. Com uma pergunta só, de escolha
 * única, clicar numa opção já responde.
 */
export function QuestionCard({
  request,
  onAnswer
}: {
  request: PermissionItem
  onAnswer: (answers: Record<string, string> | null) => void
}): JSX.Element {
  const armed = useArmed()
  const questions = parseQuestions(request.input)
  const [picked, setPicked] = useState<string[][]>(() => questions?.map(() => []) ?? [])
  const [other, setOther] = useState<string[]>(() => questions?.map(() => '') ?? [])

  if (request.status !== 'pending') {
    return (
      <div
        className={`permission question permission-${request.status}`}
        role="group"
        aria-label={t('Pergunta do Claude')}
      >
        <div className="permission-title">{t('Pergunta do Claude')}</div>
        {questions?.map((q) => (
          <div key={q.question} className="question-block">
            <div className="question-text">{q.question}</div>
            {request.answers?.[q.question] && (
              <div className="question-answer">{request.answers[q.question]}</div>
            )}
          </div>
        ))}
        <div className="permission-result">{RESULT[request.status] ?? ''}</div>
      </div>
    )
  }

  if (!questions) {
    return (
      <div
        className="permission question permission-pending"
        role="group"
        aria-label={t('Pergunta do Claude')}
      >
        <div className="permission-title">{t('Pergunta do Claude')}</div>
        <p className="question-text">{t('Não consegui mostrar esta pergunta.')}</p>
        <div className="permission-actions">
          <button type="button" className="deny" onClick={() => armed() && onAnswer(null)}>
            {t('Pular')}
          </button>
        </div>
      </div>
    )
  }

  const quick = questions.length === 1 && !questions[0].multiSelect
  const answerOf = (index: number): string => {
    const typed = other[index].trim()
    if (!questions[index].multiSelect) return typed || picked[index][0] || ''
    return [...picked[index], typed].filter(Boolean).join(', ')
  }
  const complete = questions.every((_, index) => answerOf(index) !== '')
  const submit = (): void => {
    if (!armed() || !complete) return
    onAnswer(Object.fromEntries(questions.map((q, index) => [q.question, answerOf(index)])))
  }

  const choose = (index: number, label: string): void => {
    if (!armed()) return
    const q = questions[index]
    if (quick) {
      onAnswer({ [q.question]: label })
      return
    }
    setPicked((all) =>
      all.map((labels, i) => {
        if (i !== index) return labels
        if (!q.multiSelect) return [label]
        return labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label]
      })
    )
    // Na escolha única, marcar uma opção substitui o que foi escrito.
    if (!q.multiSelect) setOther((all) => all.map((value, i) => (i === index ? '' : value)))
  }

  const type = (index: number, value: string): void => {
    setOther((all) => all.map((old, i) => (i === index ? value : old)))
    if (!questions[index].multiSelect && value.trim()) {
      setPicked((all) => all.map((labels, i) => (i === index ? [] : labels)))
    }
  }

  return (
    <div
      className="permission question permission-pending"
      role="group"
      aria-label={t('Pergunta do Claude')}
    >
      <div className="permission-title">{t('Pergunta do Claude')}</div>
      {questions.map((q, index) => (
        <div key={q.question} className="question-block">
          {q.header && <span className="question-header">{q.header}</span>}
          <div className="question-text">{q.question}</div>
          <div className="question-options" role={q.multiSelect ? 'group' : 'radiogroup'}>
            {q.options.map((option) => {
              const selected = picked[index].includes(option.label)
              return (
                <button
                  key={option.label}
                  type="button"
                  className={`question-option${selected ? ' selected' : ''}`}
                  role={q.multiSelect ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  title={option.description || undefined}
                  onClick={() => choose(index, option.label)}
                >
                  <span>{option.label}</span>
                  {option.description && <small>{option.description}</small>}
                </button>
              )
            })}
          </div>
          <input
            className="question-other"
            value={other[index]}
            placeholder={q.multiSelect ? t('Mais alguma coisa…') : t('Outra resposta…')}
            onChange={(event) => type(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) submit()
            }}
          />
        </div>
      ))}
      <div className="permission-actions">
        {(!quick || other[0].trim() !== '') && (
          <button type="button" className="allow" disabled={!complete} onClick={submit}>
            {t('Responder')}
          </button>
        )}
        <button type="button" className="deny" onClick={() => armed() && onAnswer(null)}>
          {t('Pular')}
        </button>
      </div>
    </div>
  )
}

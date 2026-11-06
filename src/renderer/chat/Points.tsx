import { useState } from 'react'
import type { JSX } from 'react'
import { DiffCount } from './DiffView'
import { Markdown } from './Markdown'
import type { AsideResult, RewindPreview } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** O voltar esperando a confirmação: o turno e o que muda nos arquivos. */
interface Asking {
  turn: number
  preview: RewindPreview
  files: boolean
}

/** A pergunta lateral aberta: a última pergunta e a resposta dela. */
interface Aside {
  question: string
  answer: AsideResult | null
  waiting: boolean
}

export interface Points {
  /** Pede para voltar ao turno (abre a confirmação, com o que muda nos arquivos). */
  rewind(turn: number): void
  /** Uma aba nova com a conversa até o fim do turno. */
  fork(turn: number): void
  /** Abre a pergunta lateral (com uma pergunta, já a faz). */
  aside(question?: string): void
  /** Um aviso curto acima da caixa (a pré-visualização que não abriu, Fase 47). */
  say(text: string): void
  /** A confirmação e a pergunta lateral, para ficarem acima da caixa. */
  panel: JSX.Element | null
}

/**
 * Voltar, ramificar e a pergunta lateral (Fase 46): o que o painel de uma conversa mostra acima
 * da caixa. `putDraft` devolve o texto da mensagem que saiu para a caixa.
 */
export function usePoints(conversation: string, putDraft: (text: string) => void): Points {
  const [asking, setAsking] = useState<Asking | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [aside, setAside] = useState<Aside | null>(null)
  const [question, setQuestion] = useState('')

  const rewind = (turn: number): void => {
    setNote(null)
    void window.wisp.chat.rewindPreview(conversation, turn).then((preview) => {
      if (!preview.ok) setNote({ ok: false, text: preview.message ?? t('Não deu para voltar.') })
      else setAsking({ turn, preview, files: preview.files.length > 0 })
    })
  }

  const confirm = async (): Promise<void> => {
    if (!asking) return
    const files = asking.files
      ? asking.preview.files
          .filter((file) => file.canUndo)
          .map(({ path, hash }) => ({ path, hash }))
      : null
    const result = await window.wisp.chat.rewind(conversation, asking.turn, files)
    setAsking(null)
    if (!result.ok) {
      setNote({ ok: false, text: result.message ?? t('Não deu para voltar.') })
      return
    }
    putDraft(result.text)
    const parts: string[] = []
    if (result.undone.length === 1) parts.push(t('1 arquivo voltou a ser como era.'))
    else if (result.undone.length > 1) {
      parts.push(t('{count} arquivos voltaram a ser como eram.', { count: result.undone.length }))
    }
    if (result.attachments.length) {
      parts.push(t('Os anexos da mensagem não voltam: anexe de novo se precisar.'))
    }
    parts.push(...result.problems)
    setNote(parts.length ? { ok: !result.problems.length, text: parts.join(' ') } : null)
  }

  const fork = (turn: number): void => {
    setNote(null)
    void window.wisp.chat.fork(conversation, turn)
  }

  const ask = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) return
    setAside({ question: trimmed, answer: null, waiting: true })
    setQuestion('')
    const answer = await window.wisp.chat.aside(conversation, trimmed)
    setAside((current) =>
      current?.question === trimmed ? { question: trimmed, answer, waiting: false } : current
    )
  }

  const openAside = (text?: string): void => {
    if (text?.trim()) void ask(text)
    else setAside((current) => current ?? { question: '', answer: null, waiting: false })
  }

  const confirmCard = asking && (
    <div className="rewind-card" role="dialog" aria-label={t('Voltar a este ponto')}>
      <strong>{t('Voltar para antes desta mensagem?')}</strong>
      <p>
        {t(
          'Ela e o que veio depois saem da conversa (o Claude esquece), e o texto dela volta para a caixa.'
        )}
      </p>
      {asking.preview.files.length > 0 && (
        <>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={asking.files}
              onChange={(event) =>
                setAsking((current) => current && { ...current, files: event.target.checked })
              }
            />
            {asking.preview.files.length === 1
              ? t('Voltar também o arquivo que mudou daí em diante')
              : t('Voltar também os {count} arquivos que mudaram daí em diante', {
                  count: asking.preview.files.length
                })}
          </label>
          <ul className="worktree-files">
            {asking.preview.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <DiffCount
                  diff={{ added: file.removed, removed: file.added, hunks: [], truncated: false }}
                />
                {!file.canUndo && <small>{t('sem a cópia de antes')}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
      {asking.preview.partial && (
        <small className="settings-hint">
          {t(
            'Parte dessas respostas é de antes de o Wisp abrir: os arquivos que elas mudaram ficam como estão.'
          )}
        </small>
      )}
      <div className="rewind-actions">
        <button type="button" className="settings-button danger" onClick={() => void confirm()}>
          {t('Voltar')}
        </button>
        <button type="button" className="settings-button" onClick={() => setAsking(null)}>
          {t('Cancelar')}
        </button>
      </div>
    </div>
  )

  const asideBox = aside && (
    <div className="aside-box" role="region" aria-label={t('Pergunta lateral')}>
      <div className="aside-head">
        <strong>{t('Pergunta lateral')}</strong>
        <small>{t('não entra na conversa nem para o Claude')}</small>
        <button
          type="button"
          className="link"
          onClick={() => setAside(null)}
          aria-label={t('Fechar a pergunta lateral')}
        >
          ×
        </button>
      </div>
      {aside.question && (
        <div className="aside-answer" aria-live="polite">
          <p className="aside-question">{aside.question}</p>
          {aside.waiting ? (
            <span className="spinner" aria-label={t('Pensando')} />
          ) : aside.answer ? (
            <div className={aside.answer.ok ? 'aside-text' : 'settings-error'}>
              <Markdown text={aside.answer.text} />
            </div>
          ) : null}
        </div>
      )}
      <form
        className="aside-form"
        onSubmit={(event) => {
          event.preventDefault()
          void ask(question)
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('Pergunte sem interromper o Claude…')}
          aria-label={t('A pergunta lateral')}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') setAside(null)
          }}
        />
        <button type="submit" className="settings-button" disabled={aside.waiting}>
          {t('Perguntar')}
        </button>
      </form>
    </div>
  )

  const noteLine = note && (
    <div className="points-note">
      <small className={note.ok ? 'settings-hint' : 'settings-error'} role="status">
        {note.text}
      </small>
      <button type="button" className="link" onClick={() => setNote(null)} aria-label={t('Fechar')}>
        ×
      </button>
    </div>
  )

  const panel =
    confirmCard || asideBox || noteLine ? (
      <div className="points">
        {confirmCard}
        {noteLine}
        {asideBox}
      </div>
    ) : null

  const say = (text: string): void => setNote({ ok: false, text })

  return { rewind, fork, aside: openAside, say, panel }
}

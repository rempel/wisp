// O Rodar da bancada (Fase 75): os servidores da pasta da conversa em foco, um botão para cada.
// O clique mostra o comando inteiro e pede a confirmação; confirmado, ele roda num terminal novo
// e, com a porta conhecida, a página abre no navegador quando ela responde.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { LaunchConfig } from '../../shared/ipc'
import { t } from '../../shared/i18n'

export function LaunchRow({ folder }: { folder: string | null }): JSX.Element | null {
  const [configs, setConfigs] = useState<LaunchConfig[]>([])
  const [asking, setAsking] = useState<LaunchConfig | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.wisp.shell.launches(folder).then((list) => {
      if (alive) setConfigs(list)
    })
    return () => {
      alive = false
    }
  }, [folder])

  if (!folder || !configs.length) return null
  const run = async (config: LaunchConfig): Promise<void> => {
    setAsking(null)
    setNote(await window.wisp.shell.launch(folder, config.command))
  }
  return (
    <div className="workbench-launch" role="group" aria-label={t('Rodar o projeto')}>
      {asking ? (
        <>
          <span className="workbench-launch-ask">
            {t('Rodar na pasta do projeto?')} <code>{asking.command}</code>
          </span>
          <button type="button" className="settings-button" onClick={() => void run(asking)}>
            {t('Rodar')}
          </button>
          <button type="button" className="link" onClick={() => setAsking(null)}>
            {t('Cancelar')}
          </button>
        </>
      ) : (
        configs.map((config) => (
          <button
            key={config.command}
            type="button"
            className="workbench-chip"
            title={
              config.port
                ? t('{command} (a página abre quando a porta {port} responder)', {
                    command: config.command,
                    port: config.port
                  })
                : config.command
            }
            onClick={() => {
              setNote(null)
              setAsking(config)
            }}
          >
            ▶ {config.name}
          </button>
        ))
      )}
      {note && (
        <small className="settings-error" role="alert">
          {note}
        </small>
      )}
    </div>
  )
}

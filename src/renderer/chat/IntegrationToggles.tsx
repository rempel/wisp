// As integrações com o sistema nas configurações (Fases 64, 67 e 72): o "Perguntar ao Wisp" do
// gerenciador de arquivos, o comando wisp no PATH (Windows) e a busca do desktop (Linux).
import type { JSX, ReactNode } from 'react'
import type { Settings } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const WINDOWS = navigator.userAgent.includes('Windows')

export function IntegrationToggles({
  values,
  save,
  toggle
}: {
  values: Settings
  save: (patch: Partial<Settings>) => unknown
  /** O interruptor das configurações (o mesmo desenho dos outros). */
  toggle: (props: {
    label: string
    hint: string
    checked: boolean
    onChange: (value: boolean) => void
  }) => ReactNode
}): JSX.Element {
  return (
    <>
      {toggle({
        label: t('"Perguntar ao Wisp" no gerenciador de arquivos'),
        hint: t(
          'Põe a opção no clique direito dos arquivos (no Nautilus, em Scripts; no Dolphin e no Explorer do Windows, no menu). O arquivo vai como anexo para a conversa em foco. Desligar tira o que o Wisp pôs.'
        ),
        checked: values.fileManagerMenu,
        onChange: (fileManagerMenu) => void save({ fileManagerMenu })
      })}
      {WINDOWS &&
        toggle({
          label: t('O comando wisp no PATH'),
          hint: t(
            'Põe a pasta do comando no PATH do seu usuário, para usar wisp --ask "..." em qualquer terminal (vale nos terminais abertos depois).'
          ),
          checked: values.commandInPath,
          onChange: (commandInPath) => void save({ commandInPath })
        })}
      {!WINDOWS &&
        toggle({
          label: t('O Wisp na busca do desktop'),
          hint: t(
            'Na busca do KDE (KRunner) ou do GNOME, "wisp" e uma pergunta oferecem Perguntar ao Wisp. Só o que começa com "wisp" chega a ele. No GNOME, vale nos pacotes .deb e Flatpak.'
          ),
          checked: values.desktopSearch,
          onChange: (desktopSearch) => void save({ desktopSearch })
        })}
      {!WINDOWS &&
        toggle({
          label: t('Extensão do Wisp para o GNOME'),
          hint: t(
            'No GNOME com Wayland, o sistema não deixa o Wisp ver as janelas dos outros programas. A extensão devolve isso: listar as janelas e trazer uma para a frente. Depois de ligar, saia da sessão e entre de novo. Qualquer programa da sua sessão passa a poder ler a lista de janelas por ela.'
          ),
          checked: values.gnomeExtension,
          onChange: (gnomeExtension) => void save({ gnomeExtension })
        })}
    </>
  )
}

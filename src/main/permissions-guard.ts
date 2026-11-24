// As permissões do Chromium para as páginas do Wisp (separado do index.ts, que fica no limite de
// tamanho dos arquivos).
import { session } from 'electron'
import { getMascotWindow } from './mascot'

/**
 * As permissões que as páginas do Wisp podem pedir ao Chromium: o microfone, só para a página do
 * mascote (onde roda a captura de voz) e só o áudio; e escrever na área de transferência (o botão
 * de copiar do painel). Câmera, tela, localização, notificações e o resto são negados.
 */
export function guardPermissions(): void {
  const isMascot = (contents: Electron.WebContents | null): boolean =>
    contents !== null && contents === getMascotWindow()?.webContents
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission === 'media') {
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
      callback(isMascot(contents) && types.length > 0 && types.every((type) => type === 'audio'))
      return
    }
    callback(permission === 'clipboard-sanitized-write')
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (permission !== 'media') return true
    return isMascot(contents) && (details as { mediaType?: string }).mediaType === 'audio'
  })
}

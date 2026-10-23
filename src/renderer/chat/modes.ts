import { PERMISSION_MODES } from '../../shared/ipc'
import type { PermissionMode } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** Os modos de permissão, como aparecem na pílula, no menu dela e nas configurações. */
export const MODE_TEXT: Record<PermissionMode, { label: string; hint: string }> = {
  default: { label: t('Pedir'), hint: t('pede antes de cada comando, edição ou app') },
  acceptEdits: {
    label: t('Aceitar edições'),
    hint: t('edita arquivos sem pedir (menos os ocultos); comandos pedem')
  },
  plan: { label: t('Planejar'), hint: t('só lê e monta um plano para você aprovar') },
  auto: {
    label: t('Automático'),
    hint: t('o Claude Code faz o que você pediu e barra o arriscado')
  }
}

/** O próximo modo do Shift+Tab, como no Claude Code do terminal. */
export function nextMode(mode: PermissionMode): PermissionMode {
  return PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]
}

import { PERMISSION_MODES } from '../../shared/ipc'
import type { PermissionMode } from '../../shared/ipc'

/** Os modos de permissão, como aparecem na pílula, no menu dela e nas configurações. */
export const MODE_TEXT: Record<PermissionMode, { label: string; hint: string }> = {
  default: { label: 'Pedir', hint: 'pede antes de cada comando, edição ou app' },
  acceptEdits: {
    label: 'Aceitar edições',
    hint: 'edita arquivos sem pedir (menos os ocultos); comandos pedem'
  },
  plan: { label: 'Planejar', hint: 'só lê e monta um plano para você aprovar' },
  auto: { label: 'Automático', hint: 'o Claude Code faz o que você pediu e barra o arriscado' }
}

/** O próximo modo do Shift+Tab, como no Claude Code do terminal. */
export function nextMode(mode: PermissionMode): PermissionMode {
  return PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]
}

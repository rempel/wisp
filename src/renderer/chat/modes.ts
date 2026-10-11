import { PERMISSION_MODES } from '../../shared/ipc'
import type { PermissionMode } from '../../shared/ipc'

/** O próximo modo do Shift+Tab, como no Claude Code do terminal. */
export function nextMode(mode: PermissionMode): PermissionMode {
  return PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]
}

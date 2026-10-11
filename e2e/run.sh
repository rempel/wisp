#!/usr/bin/env bash
# Roda os testes de ponta a ponta num X virtual (Xvfb) e com um D-Bus de sessão só deles, como no
# CI. Antes: npm run build. Uso: e2e/run.sh [roteiros], por padrão todos os e2e/*.mjs (menos o lib).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${WISP_E2E_INNER:-}" ]; then
  exec env WISP_E2E_INNER=1 dbus-run-session -- xvfb-run -a -s '-screen 0 1600x900x24' "$0" "$@"
fi
if [ $# -eq 0 ]; then
  set -- $(ls e2e/*.mjs | grep -v '/lib\.mjs$')
fi
status=0
for script in "$@"; do
  echo "== $script"
  node "$script" || status=1
done
exit $status

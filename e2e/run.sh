#!/usr/bin/env bash
# Roda os testes de ponta a ponta num X virtual (Xvfb) e com um D-Bus de sessão só deles, como no
# CI. Antes: npm run build. Uso: e2e/run.sh [roteiros], por padrão todos os e2e/*.mjs (menos o lib);
# com WISP_E2E_SHARD=i/n, só a parte i de n deles.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${WISP_E2E_INNER:-}" ]; then
  exec env WISP_E2E_INNER=1 dbus-run-session -- xvfb-run -a -s '-screen 0 1600x900x24' "$0" "$@"
fi
if [ $# -eq 0 ]; then
  set -- $(ls e2e/*.mjs | grep -v '/lib\.mjs$')
  # WISP_E2E_SHARD=2/3: só a segunda de três partes da lista (o CI roda as partes em paralelo).
  if [ -n "${WISP_E2E_SHARD:-}" ]; then
    part=${WISP_E2E_SHARD%/*}
    parts=${WISP_E2E_SHARD#*/}
    picked=""
    n=0
    for script in "$@"; do
      if [ $((n % parts + 1)) -eq "$part" ]; then picked="$picked $script"; fi
      n=$((n + 1))
    done
    set -- $picked
  fi
fi
status=0
for script in "$@"; do
  echo "== $script"
  if ! node "$script"; then
    status=1
    # Um roteiro que caiu no meio pode deixar o Wisp aberto (com a porta do DevTools ocupada) e
    # derrubar os seguintes: fecha o que sobrou dele.
    pkill -f -- '--remote-debugging-port=9333' || true
    sleep 1
  fi
done
exit $status

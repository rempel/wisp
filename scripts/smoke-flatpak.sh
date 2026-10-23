#!/bin/bash
# Confere o Flatpak instalado (no CI, depois do flatpak-builder --user --install): os arquivos, o
# Electron rodando dentro do runtime, o flatpak-spawn --host (o caminho do Claude Code e dos
# programas do sistema) e o app aberto de verdade, num X virtual.
# Precisa de xvfb-run, dbus-run-session e curl. Uso: scripts/smoke-flatpak.sh
set -euo pipefail
cd "$(dirname "$0")/.."

app=io.github.rempel.Wisp
fail() {
  echo "FALHOU: $*" >&2
  exit 1
}
ok() { echo "ok   $*"; }
inside() { flatpak run --command="$1" "${@:2}"; }

echo "== $app"
flatpak info "$app" >/dev/null || fail "o Flatpak não está instalado"
for path in /app/bin/wisp /app/wisp/wisp /app/wisp/resources/app/out/main/index.js \
  /app/wisp/resources/app/node_modules/node-pty/build/Release/pty.node \
  /app/share/applications/$app.desktop /app/share/metainfo/$app.metainfo.xml; do
  inside test "$app" -e "$path" || fail "o Flatpak não tem $path"
done
ok "o app, o node-pty, o .desktop e o metainfo"
electron=$(flatpak run --command=/app/wisp/wisp --env=ELECTRON_RUN_AS_NODE=1 "$app" \
  -e 'console.log(process.versions.electron)') || fail "o Electron não roda no runtime"
ok "o Electron $electron roda dentro do runtime"
host=$(dbus-run-session -- flatpak run --command=flatpak-spawn "$app" --host uname -n) ||
  fail "o flatpak-spawn --host não roda"
[ "$host" = "$(uname -n)" ] || fail "o flatpak-spawn não rodou fora do sandbox ($host)"
ok "o flatpak-spawn --host roda programas do sistema (o caminho do Claude Code)"
seen=$(dbus-run-session -- flatpak run --command=/app/wisp/wisp --env=ELECTRON_RUN_AS_NODE=1 \
  "$app" -e '
    const { execFileSync } = require("child_process")
    // Como o viaHost faz: tira a chave, põe uma variável e roda no sistema.
    const out = execFileSync("flatpak-spawn", ["--host", "env", "-u", "ANTHROPIC_API_KEY",
      "WISP_TESTE=1", "sh", "-c", "echo ${ANTHROPIC_API_KEY:-sem-chave} $WISP_TESTE"])
    console.log(out.toString().trim())
  ') || fail "o Wisp não roda programas do sistema"
[ "$seen" = "sem-chave 1" ] || fail "as variáveis não chegaram como deviam ($seen)"
ok "as variáveis passam (e a chave da API não)"

# Aberto de verdade, como alguém que o instalou e clicou.
work=$(mktemp -d)
trap 'pkill -f "/app/wisp/wisp" 2>/dev/null || true; rm -rf "$work"' EXIT
dbus-run-session -- xvfb-run -a flatpak run "$app" --no-sandbox --remote-debugging-port=9335 \
  >"$work/saida.log" 2>&1 &
for _ in $(seq 1 90); do
  curl -s http://127.0.0.1:9335/json/list | grep -q '/renderer/mascot/index.html' && break
  sleep 1
done
curl -s http://127.0.0.1:9335/json/list | grep -q '/renderer/mascot/index.html' || {
  cat "$work/saida.log"
  fail "o mascote não apareceu"
}
ok "abre: o mascote apareceu"
launcher="$HOME/.var/app/$app/data/wisp/bin/wisp"
grep -q "exec flatpak run '$app'" "$launcher" || fail "o comando wisp não chama o flatpak run"
ok "o comando wisp chama o flatpak run"
# O registro fica no XDG_STATE_HOME do Flatpak (~/.var/app/<id>/.local/state).
grep -rqs --include=wisp.log '(flatpak)' "$HOME/.var/app/$app" || fail "o registro não diz que é o Flatpak"
ok "o registro diz que é o Flatpak"
echo "all ok"

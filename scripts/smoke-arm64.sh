#!/usr/bin/env bash
# Confere os pacotes ARM64 montados em dist/ (scripts/package-arm64.sh): a arquitetura do .deb, o
# Electron e o node-pty compilados para ARM64, e o mesmo conteúdo do pacote x86-64. Abrir o app
# pede uma máquina ARM; isto confere o que dá para conferir num x86-64.
# Uso: scripts/smoke-arm64.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "FALHOU: $*" >&2
  exit 1
}
ok() { echo "ok   $*"; }

deb=$(realpath "$(ls dist/*_arm64.deb | head -n 1)")
appimage=$(realpath "$(ls dist/*-arm64.AppImage | head -n 1)")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "== $(basename "$deb")"
[ "$(dpkg-deb -f "$deb" Architecture)" = arm64 ] || fail "o .deb não é arm64"
ok "Architecture: arm64"
dpkg-deb -x "$deb" "$work/deb"
for path in \
  opt/Wisp/wisp \
  opt/Wisp/chrome_crashpad_handler \
  opt/Wisp/resources/app/node_modules/node-pty/build/Release/pty.node; do
  [ -e "$work/deb/$path" ] || fail "o .deb não tem $path"
  file -b "$work/deb/$path" | grep -q 'ARM aarch64' || fail "$path não é ARM64: $(file -b "$work/deb/$path")"
done
ok "o Electron e o node-pty (modo terminal) compilados para ARM64"
for path in \
  opt/Wisp/resources/app/out/main/index.js \
  opt/Wisp/resources/app/out/main/wisp-hook.js \
  usr/share/applications/io.github.rempel.Wisp.desktop; do
  [ -e "$work/deb/$path" ] || fail "o .deb não tem $path"
done
ok "o app, o relay dos hooks e o .desktop"

echo "== $(basename "$appimage")"
file -b "$appimage" | grep -q 'ARM aarch64' || fail "o AppImage não é ARM64: $(file -b "$appimage")"
ok "o AppImage é ARM64"

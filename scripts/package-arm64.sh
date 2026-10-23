#!/usr/bin/env bash
# Monta o .deb e o AppImage para ARM64 num computador x86-64 (o CI não tem máquina ARM): o
# Electron de ARM64, o node-pty compilado com o compilador cruzado e o electron-builder com
# --arm64. O pty.node de x86-64 volta para o lugar no fim, para os testes daqui continuarem.
# Precisa do g++-aarch64-linux-gnu. Antes: npm run build. Uso: scripts/package-arm64.sh
set -euo pipefail
cd "$(dirname "$0")/.."

electron=.cache/electron-arm64
node scripts/electron-arm64.mjs "$electron"

pty=node_modules/node-pty/build/Release/pty.node
backup=$(mktemp -d)
cp "$pty" "$backup/pty.node"
trap 'cp "$backup/pty.node" "$pty"; rm -rf "$backup"' EXIT
# O node-pty usa a N-API: os cabeçalhos do Node servem para o Electron.
CC=aarch64-linux-gnu-gcc CXX=aarch64-linux-gnu-g++ LINK=aarch64-linux-gnu-g++ \
  npx --no-install node-gyp rebuild --arch=arm64 --directory=node_modules/node-pty >/dev/null
file -b "$pty" | grep -q 'ARM aarch64' || { echo "o pty.node não saiu para ARM64" >&2; exit 1; }

npx --no-install electron-builder --linux deb AppImage --arm64 \
  -c.electronDist="$electron" --publish never

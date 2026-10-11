#!/bin/bash
# Confere os pacotes montados em dist/ (no CI, depois do electron-builder): o que vai no .deb, e o
# AppImage aberto de verdade, num X virtual e num HOME vazio, como alguém que o baixou e clicou.
# Precisa de xvfb-run, dbus-run-session e curl. Uso: scripts/smoke-packages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "FALHOU: $*" >&2
  exit 1
}
ok() { echo "ok   $*"; }

deb=$(realpath "$(ls dist/*.deb | head -n 1)")
appimage=$(realpath "$(ls dist/*.AppImage | head -n 1)")
work=$(mktemp -d)
trap 'pkill -f "appimage_extracted_" 2>/dev/null || true; rm -rf "$work"' EXIT

echo "== $(basename "$deb")"
dpkg-deb -c "$deb" | awk '{print $6}' >"$work/deb.txt"
for path in \
  ./opt/Wisp/wisp \
  ./opt/Wisp/resources/app/out/main/index.js \
  ./opt/Wisp/resources/app/out/main/wisp-hook.js \
  ./opt/Wisp/resources/app/out/main/wisp-demo.js \
  ./opt/Wisp/resources/app/resources/demo/index.json \
  ./usr/share/applications/io.github.rempel.Wisp.desktop \
  ./usr/share/icons/hicolor/256x256/apps/wisp.png; do
  grep -qxF "$path" "$work/deb.txt" || fail "o .deb não tem $path"
done
ok "o app, o relay dos hooks, a demonstração, o .desktop e o ícone"
! grep -q '/out/test/' "$work/deb.txt" || fail "o .deb leva os testes de unidade"
! grep -q 'default_app.asar' "$work/deb.txt" || fail "o .deb leva o app padrão do Electron"
ok "sem os testes e sem o app padrão do Electron"
dpkg-deb -e "$deb" "$work/control"
grep -q apparmor "$work/control/postinst" || fail "o postinst não instala o perfil do AppArmor"
ok "o postinst instala o perfil do AppArmor"
dpkg-deb --fsys-tarfile "$deb" |
  tar -xO ./usr/share/applications/io.github.rempel.Wisp.desktop >"$work/wisp.desktop"
grep -qx 'Actions=toggle;new;' "$work/wisp.desktop" || fail "o .desktop sem as ações"
grep -q '^Exec=/opt/Wisp/wisp --ozone-platform=x11 --toggle' "$work/wisp.desktop" ||
  fail "a ação Mostrar/esconder sem o X11"
ok "o .desktop com as ações Mostrar/esconder e Nova conversa"

echo "== $(basename "$appimage")"
chmod +x "$appimage"
(cd "$work" && "$appimage" --appimage-extract >/dev/null)
root="$work/squashfs-root"
[ -x "$root/wisp" ] || fail "o AppImage não tem o executável wisp"
ls "$root"/*.desktop >/dev/null 2>&1 || fail "o AppImage não tem um .desktop"
electron=$(ELECTRON_RUN_AS_NODE=1 "$root/wisp" -e 'console.log(process.versions.electron)') ||
  fail "o fuse RunAsNode está desligado (o relay dos hooks não rodaria)"
ok "RunAsNode ligado (Electron $electron): o relay dos hooks e o navegador rodam"
NODE_OPTIONS=--require=/nao/existe.js ELECTRON_RUN_AS_NODE=1 "$root/wisp" -e '' ||
  fail "o NODE_OPTIONS ainda vale (o fuse deveria desligá-lo)"
ok "NODE_OPTIONS ignorado"
reply=$(printf '%s\n' \
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"quanto é 2^32?"}]}}' |
  ELECTRON_RUN_AS_NODE=1 "$root/wisp" "$root/resources/app/out/main/wisp-demo.js" -p)
grep -q '4.294.967.296' <<<"$reply" || fail "a demonstração não respondeu: $reply"
ok "o Claude Code gravado da demonstração responde"

# Aberto de verdade: sem FUSE (o runner pode não ter), o AppImage extrai e roda.
home="$work/home"
mkdir -p "$home"
HOME="$home" APPIMAGE_EXTRACT_AND_RUN=1 xvfb-run -a dbus-run-session -- \
  "$appimage" --no-sandbox --remote-debugging-port=9334 >"$work/saida.log" 2>&1 &
for _ in $(seq 1 60); do
  curl -s http://127.0.0.1:9334/json/list | grep -q '/renderer/mascot/index.html' && break
  sleep 1
done
curl -s http://127.0.0.1:9334/json/list | grep -q '/renderer/mascot/index.html' || {
  cat "$work/saida.log"
  fail "o mascote não apareceu"
}
ok "abre: o mascote apareceu"
launcher="$home/.local/share/wisp/bin/wisp"
grep -qF "$appimage" "$launcher" || fail "o comando wisp não aponta para o AppImage"
grep -qx "Exec=$launcher" "$home/.local/share/applications/io.github.rempel.Wisp.desktop" ||
  fail "a entrada do menu não chama o comando wisp"
grep -qx "Icon=$home/.local/share/wisp/icon.png" \
  "$home/.local/share/applications/io.github.rempel.Wisp.desktop" ||
  fail "a entrada do menu sem o ícone copiado"
[ -s "$home/.local/share/wisp/icon.png" ] || fail "o ícone não foi copiado para fora do AppImage"
ok "o comando wisp aponta para o AppImage, e o menu, para ele e para o ícone copiado"
head -n 1 "$home/.local/state/wisp/wisp.log" | grep -q '(appimage)' ||
  fail "o registro não diz que é o AppImage: $(head -n 1 "$home/.local/state/wisp/wisp.log")"
ok "o registro em ~/.local/state/wisp/wisp.log"
echo "all ok"

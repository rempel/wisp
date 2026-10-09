#!/usr/bin/env bash
# No Ubuntu 23.10+ (incluindo o 26.04), o AppArmor bloqueia user namespaces para binários sem
# perfil, e o Electron de desenvolvimento (node_modules/electron) aborta com "No usable sandbox!".
# Este script cria um perfil só para esse binário, como recomenda a documentação do Chromium:
# https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
electron="$root/node_modules/electron/dist/electron"
name="wisp-dev-electron"
profile="/etc/apparmor.d/$name"

if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" != 1 ]; then
  echo "Este sistema não restringe user namespaces; não há nada a fazer."
  exit 0
fi

if [ ! -x "$electron" ]; then
  echo "Binário do Electron não encontrado em $electron." >&2
  echo "Rode 'npm install' e depois 'npx install-electron' e tente de novo." >&2
  exit 1
fi

echo "Criando $profile para:"
echo "  $electron"
echo "(precisa de sudo)"

sudo tee "$profile" >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>

profile $name "$electron" flags=(unconfined) {
  userns,

  include if exists <local/$name>
}
EOF

sudo apparmor_parser -r "$profile"
echo "Pronto. Agora o 'npm run dev' deve abrir normalmente."
echo "Se mover a pasta do projeto de lugar, rode este script de novo."

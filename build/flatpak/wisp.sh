#!/bin/sh
# O Wisp no Flatpak: o Electron pelo zypak (o sandbox do Chromium dentro do do Flatpak) e sempre
# pelo XWayland, que o mascote precisa para ficar no topo.
exec zypak-wrapper /app/wisp/wisp --ozone-platform=x11 "$@"

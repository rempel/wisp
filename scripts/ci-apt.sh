#!/usr/bin/env bash
# Instala pacotes do apt no CI sem deixar um espelho lento derrubar o job (Fase 28): cada passo tem
# um tempo limite e até três tentativas, e os .deb baixados ficam em APT_CACHE (o actions/cache do
# workflow guarda a pasta entre um push e outro; com tudo lá, o install não baixa nada).
# Uso: APT_CACHE=~/.cache/apt scripts/ci-apt.sh pacote...
set -euo pipefail

cache=${APT_CACHE:-$HOME/.cache/apt}
mkdir -p "$cache/partial"
options=(
  -o "Acquire::Retries=3"
  -o "Acquire::http::Timeout=30"
  -o "Acquire::https::Timeout=30"
  -o "Dir::Cache::Archives=$cache"
)

# Roda o comando até três vezes, cada uma com o tempo limite dado (em segundos).
try() {
  local limit=$1
  shift
  for attempt in 1 2 3; do
    if sudo timeout "$limit" "$@"; then
      return 0
    fi
    echo "::warning::'$*' falhou ou passou de ${limit}s (tentativa $attempt de 3)"
    sleep $((attempt * 10))
  done
  return 1
}

try 120 apt-get "${options[@]}" update
try 300 env DEBIAN_FRONTEND=noninteractive apt-get "${options[@]}" install -y --no-install-recommends "$@"
# Os arquivos baixados como root precisam ser legíveis para o actions/cache salvar a pasta.
sudo chmod -R a+rX "$cache"
sudo rm -rf "$cache/partial" "$cache/lock"

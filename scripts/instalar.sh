#!/usr/bin/env bash
# Instala (ou atualiza) o comando "secondbrain" em Mac/Linux, a partir do código no GitHub.
# Precisa de Node 22+ e Git.  Uso:
#   curl -fsSL https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/instalar.sh | bash
set -euo pipefail
command -v node >/dev/null || { echo "Falta o Node.js (22 ou mais recente): https://nodejs.org"; exit 1; }
command -v git >/dev/null || { echo "Falta o Git."; exit 1; }
echo "A instalar (pode demorar uns minutos: descarrega o Electron e compila)..."
npm install -g github:brunoajsilva/developer-second-brain
echo "Pronto. Escreve: secondbrain"

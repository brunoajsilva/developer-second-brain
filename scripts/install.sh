#!/usr/bin/env bash
# Installs (or updates) the "secondbrain" command on macOS/Linux from the code on GitHub.
# Needs Node 22+ and Git. Usage:
#   curl -fsSL https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/install.sh | bash
set -euo pipefail
command -v node >/dev/null || { echo "Node.js 22 or newer is missing: https://nodejs.org"; exit 1; }
command -v git >/dev/null || { echo "Git is missing."; exit 1; }
echo "Installing (this can take a few minutes: it downloads Electron and builds the app)..."
npm install -g github:brunoajsilva/developer-second-brain
echo "Done. Type: secondbrain"

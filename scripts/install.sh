#!/usr/bin/env bash
# Installs the newest release of the edu-sharing i18n extension into the VS Code editors of this computer: VS Code,
# VS Code Insiders, VSCodium, Cursor and Windsurf, each whose command line is on PATH. For Linux and macOS:
#
#   curl -fsSL https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.sh | bash
#
# Optional environment variables:
#   EDU_I18N_VSIX     a .vsix file to install instead of downloading the newest release
#   EDU_I18N_EDITORS  the editor commands to install into, separated by spaces (default: every editor found)
set -euo pipefail

release='https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/edu-sharing-i18n.vsix'

# The editors refuse to run as root, and the extension belongs to the user who works with it.
if [ "$(id -u)" -eq 0 ]; then
  echo 'Run this as your own user, without sudo: the extension goes into that user'"'"'s editor.' >&2
  exit 1
fi

editors=()
if [ -n "${EDU_I18N_EDITORS:-}" ]; then
  read -r -a editors <<< "$EDU_I18N_EDITORS"
else
  for name in code code-insiders codium cursor windsurf; do
    if command -v "$name" > /dev/null 2>&1; then
      editors+=("$name")
    fi
  done
fi
if [ "${#editors[@]}" -eq 0 ]; then
  echo 'No VS Code editor found (code, code-insiders, codium, cursor, windsurf).' >&2
  echo "Install VS Code from https://code.visualstudio.com, or download $release" >&2
  echo "and choose 'Extensions: Install from VSIX...' in your editor." >&2
  exit 1
fi

vsix="${EDU_I18N_VSIX:-}"
if [ -z "$vsix" ]; then
  vsix="$(mktemp -d)/edu-sharing-i18n.vsix"
  echo "Downloading $release"
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL -o "$vsix" "$release"
  elif command -v wget > /dev/null 2>&1; then
    wget -q -O "$vsix" "$release"
  else
    echo 'Neither curl nor wget is installed.' >&2
    exit 1
  fi
fi

failed=()
for editor in "${editors[@]}"; do
  echo "Installing into $editor"
  if ! "$editor" --install-extension "$vsix" --force; then
    failed+=("$editor")
  fi
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "Installing failed for: ${failed[*]}" >&2
  exit 1
fi
echo 'Done. In windows that are open, run "Developer: Reload Window"; then open an edu-sharing checkout.'

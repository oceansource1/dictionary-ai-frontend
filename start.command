#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -d "dist/Local Lens.app" ]]; then
  echo '桌面应用尚未构建，请先运行 npm run build:desktop。'
  exit 1
fi
open "dist/Local Lens.app"

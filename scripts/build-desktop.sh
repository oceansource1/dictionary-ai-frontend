#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
destination="$PWD/dist/Dictionary & AI Frontend.app"
staging=$(mktemp -d /tmp/local-lens-build.XXXXXX)
app="$staging/Dictionary & AI Frontend.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/public" /tmp/local-lens-swift-cache
xcrun swiftc -swift-version 5 -module-cache-path /tmp/local-lens-swift-cache -O -framework Cocoa -framework WebKit desktop/LocalLens.swift -o "$app/Contents/MacOS/LocalLens"
xcrun swiftc -swift-version 5 -module-cache-path /tmp/local-lens-swift-cache -O -framework Vision -framework ImageIO desktop/OCR.swift -o "$app/Contents/Resources/local-ocr"
cp desktop/Info.plist "$app/Contents/Info.plist"
cp "$(command -v node)" "$app/Contents/Resources/node"
cp model-guidance.mjs model-installer.mjs data-paths.mjs server.mjs model-registry.mjs engine.mjs translation.mjs translation-worker.mjs ocr.mjs "$app/Contents/Resources/"
mkdir -p "$app/Contents/Resources/models" "$app/Contents/Resources/runtime"
cp models/catalog.json "$app/Contents/Resources/models/"
cp -R runtime/llama-b11435 "$app/Contents/Resources/runtime/"
cp -R licenses "$app/Contents/Resources/"
mkdir -p "$app/Contents/Resources/translation-models"
cp translation-models/manifest.json "$app/Contents/Resources/translation-models/"
python3 - "$app/Contents/Resources/node_modules" <<'PYBUILD'
import shutil,sys
shutil.copytree('node_modules',sys.argv[1],symlinks=True,ignore=lambda path,names: [n for n in names if path.endswith('/bin/napi-v6') and n in ['linux','win32']])
PYBUILD
cp public/index.html public/app.js public/model-manager.js public/style.css "$app/Contents/Resources/public/"
xattr -cr "$app"
codesign --force --sign - "$app/Contents/Resources/node"
codesign --force --sign - "$app/Contents/Resources/local-ocr"
for item in "$app/Contents/Resources/runtime/llama-b11435/"*; do
  if [[ ! -L "$item" ]] && file "$item" | rg -q "Mach-O"; then
    codesign --force --sign - "$item"
  fi
done
while IFS= read -r -d '' item; do
  if file "$item" | rg -q "Mach-O"; then
    codesign --force --sign - "$item"
  fi
done < <(find "$app/Contents/Resources/node_modules" -type f \( -name '*.node' -o -name '*.dylib' \) -print0)
xattr -d com.apple.FinderInfo "$app" 2>/dev/null || true
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
mkdir -p "$PWD/dist"
if [[ -d "$destination" ]]; then
  mv "$destination" "$PWD/dist/Dictionary & AI Frontend-previous-$(date +%Y%m%d-%H%M%S).app"
fi
ditto --norsrc "$app" "$destination"
echo "已生成：$destination"

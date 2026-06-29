#!/usr/bin/env bash
# fetch-skins.sh
#
# Downloads background skin assets from the legacy bbmobile repo into
# public/assets/skins/ so maintainers can populate the images via a
# single command.
#
# Usage:
#   bash scripts/fetch-skins.sh
#
# Requirements: curl (or wget as fallback), Node.js (for reading the shared registry)

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/georgi-cole/bbmobile/main"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/assets/skins"
SKIN_FILES=()

# Read the canonical file list from the shared registry so the download list
# stays in sync with the runtime resolver and manifest generator.
while IFS= read -r file; do
  [[ -n "$file" ]] && SKIN_FILES+=("$file")
done < <(
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const registryPath = path.resolve(process.cwd(), 'src/data/skinRegistry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const seen = new Set();

for (const key of Object.keys(registry)) {
  const entry = registry[key] || {};
  const candidates = [entry.canonicalFile, ...(entry.aliases ?? [])];
  for (const file of candidates) {
    if (typeof file === 'string' && file.length > 0 && !seen.has(file)) {
      seen.add(file);
      console.log(file);
    }
  }
}
NODE
)

mkdir -p "$DEST_DIR"

echo "Downloading skin assets into: $DEST_DIR"
echo ""

errors=0

for file in "${SKIN_FILES[@]}"; do
  url="${REPO_RAW}/public/assets/skins/${file}"
  dest="${DEST_DIR}/${file}"

  printf "  Fetching %-30s ... " "$file"

  if command -v curl &>/dev/null; then
    http_status=$(curl -fsSL -o "$dest" -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  elif command -v wget &>/dev/null; then
    if wget -q -O "$dest" "$url" 2>/dev/null; then
      http_status="200"
    else
      http_status="000"
    fi
  else
    echo "ERROR: neither curl nor wget is available." >&2
    exit 1
  fi

  if [[ "$http_status" == "200" ]]; then
    echo "OK"
  else
    echo "FAILED (HTTP ${http_status})"
    rm -f "$dest"
    errors=$((errors + 1))
  fi
done

echo ""
if [[ $errors -eq 0 ]]; then
  echo "All skin assets downloaded successfully."
else
  echo "WARNING: $errors file(s) failed to download." >&2
  exit 1
fi

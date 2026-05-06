#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
cd "$TMP"

node "$ROOT/bin/templa.js" init

# All scaffold files must exist after init
test -f src/index.html
test -f src/_layouts/main.html
test -f src/_partials/header.html
test -f src/_partials/footer.html
test -f src/css/style.css
test -f src/js/templa.js
# .gitkeep must NOT be copied
test ! -e src/js/.gitkeep

# Build must pass against the freshly-init'd project
node "$ROOT/bin/templa.js" build
test -f dist/index.html
test -f dist/css/style.css
grep -q "Hello, templa" dist/index.html
grep -q "<h1>My templa site</h1>" dist/index.html

echo "✓ init smoke test passed"

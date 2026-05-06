#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
cd "$TMP"

# --- without --ai: AGENTS.md and PLANNER.md must NOT appear ---
node "$ROOT/bin/templa.js" init
test -f src/index.html
test -f src/_layouts/main.html
test -f src/_partials/header.html
test -f src/_partials/footer.html
test -f src/css/style.css
test -f src/js/templa.js
test ! -e src/js/.gitkeep
test ! -e AGENTS.md
test ! -e PLANNER.md

# Build must pass against the freshly-init'd project
node "$ROOT/bin/templa.js" build
test -f dist/index.html
test -f dist/css/style.css
grep -q "Hello, templa" dist/index.html
grep -q "<h1>My templa site</h1>" dist/index.html

# --- with --ai: AGENTS.md and PLANNER.md appear at project root ---
TMP2=$(mktemp -d)
trap "rm -rf $TMP $TMP2" EXIT
cd "$TMP2"
node "$ROOT/bin/templa.js" init --ai
test -f src/index.html
test -f AGENTS.md
test -f PLANNER.md

# --- second init in same dir must refuse (no --force) ---
cd "$TMP2"
if node "$ROOT/bin/templa.js" init --ai >/dev/null 2>&1; then
  echo "FAIL: init should have refused to overwrite"
  exit 1
fi
# Existing files must be untouched (mtime check is overkill; presence is enough)
test -f src/index.html
test -f AGENTS.md

# --- --force must overwrite without complaint ---
cd "$TMP2"
node "$ROOT/bin/templa.js" init --ai --force >/dev/null
test -f src/index.html
test -f AGENTS.md

# --- --help must document init ---
node "$ROOT/bin/templa.js" --help | grep -q "init \[--ai\] \[--force\]"
node "$ROOT/bin/templa.js" --help | grep -q "AGENTS.md"

echo "✓ init smoke test passed"

#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
NODE_BIN=${NODE_BIN:-${NODE:-node}}

# Move development machines sometimes still expose Node 16 as `node`, while
# the ESM test suite requires the built-in Node test runner from Node 22+.
if ! "$NODE_BIN" --test --help >/dev/null 2>&1; then
  for candidate in \
    /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node \
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  do
    if [ -x "$candidate" ] && "$candidate" --test --help >/dev/null 2>&1; then
      NODE_BIN=$candidate
      break
    fi
  done
fi

if ! "$NODE_BIN" --test --help >/dev/null 2>&1; then
  echo "OKTONIK tests require Node.js 22 or newer; set NODE_BIN to a modern node binary." >&2
  exit 1
fi

cd "$ROOT"
"$NODE_BIN" --test tests/*.test.mjs
sh tests/dsp/run.sh

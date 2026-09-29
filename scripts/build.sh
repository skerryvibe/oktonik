#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
"$ROOT/scripts/build-dsp.sh"
node "$ROOT/scripts/package-profiles.mjs"

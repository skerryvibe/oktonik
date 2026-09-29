#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
node "$ROOT/scripts/verify-profiles.mjs"

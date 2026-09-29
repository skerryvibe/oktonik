#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
mkdir -p "$project_root/build/tests"
set -- -std=c11 -O2 -Wall -Wextra -Werror -I"$project_root/src/vendor"
if [ "${SANITIZE:-0}" = 1 ]; then
  set -- "$@" -fsanitize=address,undefined -fno-omit-frame-pointer
fi
"${HOST_CC:-cc}" "$@" "$project_root/tests/dsp/test_chord_pilot.c" \
  -o "$project_root/build/tests/test_chord_pilot"
"$project_root/build/tests/test_chord_pilot"

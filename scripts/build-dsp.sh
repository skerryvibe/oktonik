#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/dist" "$ROOT/build/zig-cache"
export ZIG_GLOBAL_CACHE_DIR="$ROOT/build/zig-cache"
export ZIG_LOCAL_CACHE_DIR="$ROOT/build/zig-cache"

compile() {
  if [ -n "${CC:-}" ]; then
    "$CC" "$@"
  elif [ -n "${CROSS_PREFIX:-}" ]; then
    "${CROSS_PREFIX}gcc" "$@"
  elif [ -n "${ZIG:-}" ]; then
    "$ZIG" cc -target aarch64-linux-gnu.2.28 "$@"
  elif command -v aarch64-linux-gnu-gcc >/dev/null 2>&1; then
    aarch64-linux-gnu-gcc "$@"
  elif command -v zig >/dev/null 2>&1; then
    zig cc -target aarch64-linux-gnu.2.28 "$@"
  elif [ -x "$ROOT/../tooling/zig-aarch64-macos-0.16.0/zig" ]; then
    "$ROOT/../tooling/zig-aarch64-macos-0.16.0/zig" cc -target aarch64-linux-gnu.2.28 "$@"
  else
    echo "A Move compiler is required: set CROSS_PREFIX, CC, or ZIG." >&2
    exit 1
  fi
}

COMMON="-std=c11 -O2 -Wall -Wextra -Werror -I$ROOT/src/vendor"
# shellcheck disable=SC2086
compile $COMMON -fPIC -fvisibility=hidden -shared "$ROOT/src/dsp/chord_pilot.c" -o "$ROOT/dist/dsp.so"
compile $COMMON "$ROOT/src/install_swap.c" -o "$ROOT/dist/install-swap"

for artifact in "$ROOT/dist/dsp.so" "$ROOT/dist/install-swap"; do
  artifact_type=$(file -b "$artifact")
  case "$artifact_type" in
    *ELF*"ARM aarch64"*) printf '%s\n' "$artifact_type" ;;
    *) echo "Build is not a Linux ARM64 Move artifact: $artifact_type" >&2; exit 1 ;;
  esac
done

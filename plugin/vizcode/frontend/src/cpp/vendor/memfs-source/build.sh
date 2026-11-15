#!/bin/bash
# Rebuild memfs from source.
#
# Source originally from binji/llvm-project/binji:
#   https://github.com/binji/llvm-project/tree/master/binji
# Ported to wasi-sdk 33 (<wasi/api.h>) and MAX_NODES raised to 8192.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WASI="$ROOT/wasi-sdk"
OUT="$ROOT/wasm-clang-demo/memfs"

cd "$(dirname "$0")"
"$WASI/bin/clang" --target=wasm32-wasip1 -O2 -Wall -Wextra -Wno-unused-parameter \
  -c -o memfs.o memfs.c
"$WASI/bin/clang" --target=wasm32-wasip1 -DSTB_SPRINTF_IMPLEMENTATION -x c -O2 \
  -c -o stb_sprintf.o stb_sprintf.h
"$WASI/bin/wasm-ld" -L"$WASI/share/wasi-sysroot/lib/wasm32-wasip1" \
  --no-entry --export-dynamic --allow-undefined \
  --initial-memory=4194304 \
  -o "$OUT" memfs.o stb_sprintf.o -lc

echo "built $OUT"
ls -lh "$OUT"

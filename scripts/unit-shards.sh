#!/bin/bash
# Sharded unit runner with per-file timeouts (the sandbox flake law: the
# worldmap-persist in-suite hang is inherited; isolation green, CI owns the
# authoritative run). Prints one line per file, fails on any failure.
cd /home/z/privateB || exit 1
fail=0
pass_total=0
for f in tests/unit/*.test.mjs; do
  out=$(timeout 25 node --test "$f" 2>&1)
  ec=$?
  p=$(printf '%s' "$out" | grep -oE "^. pass [0-9]+" | head -1 | grep -oE "[0-9]+" || echo 0)
  fl=$(printf '%s' "$out" | grep -oE "^. fail [0-9]+" | head -1 | grep -oE "[0-9]+" || echo 0)
  pass_total=$((pass_total + p))
  if [ "$ec" -ne 0 ] || [ "${fl:-0}" -gt 0 ]; then
    echo "FAIL $f (ec=$ec fail=$fl)"
    fail=$((fail+1))
    printf '%s\n' "$out" | grep -E "✖|not ok" | head -3
  fi
done
echo "FILES_FAILED=$fail TOTAL_PASS=$pass_total"

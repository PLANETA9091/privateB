#!/bin/bash
# mine84a.sh - mine the v0.94.0 fleet measurement (run 35801416480, job 106994441595)
L=${1:-fleet19.log}
echo "=== HEADLINES (final summary block) ==="
grep -n "HEADLINE\|=== FLEET\|fleet complete\|NORMAL END\|hard kill\|end-phase" "$L" | tail -20
echo ""
echo "=== DEATHS ==="
grep -n "died\|death\|drowned\|killed by" "$L" | grep -v "memorized\|hazard" | tail -25
echo ""
echo "=== DEATH SPOT MEMORY / FLEE ROTATIONS ==="
grep -c "death spot memorized" "$L" || true
grep -n "flee bearing rotated" "$L" | head -12
echo "rotations total: $(grep -c 'flee bearing rotated' "$L")"
echo ""
echo "=== SMELT (the 11-run wall) ==="
grep -n "smelted\|smelt:" "$L" | tail -25
echo ""
echo "=== HONEST PUT ==="
grep -n "furnace slots after put\|destination full\|slot mismatch" "$L" | head -15
echo ""
echo "=== FUEL / DOOM TTL / SPENT SLICE ==="
grep -c "no fuel" "$L" || true
grep -n "visit budget spent" "$L" | head -8
echo "spent-slice refusals: $(grep -c 'visit budget spent' "$L")"
grep -n "doomed goal" "$L" | head -6
echo "doomed refusals: $(grep -c 'doomed goal' "$L")"
echo ""
echo "=== PICKAXE / IRON ==="
grep -n "pickaxe\|iron_ingot\|raw_iron" "$L" | tail -15
echo ""
echo "=== RESCUES / EPIPE / FROZEN / SHELTERS ==="
for p in "WATER RESCUE\|rescue:" "EPIPE" "frozen" "shelter" "banked\|deposited"; do
  echo "--- $p: $(grep -c "$p" "$L" || true)"
done
echo ""
echo "=== MINED RATE ==="
grep -n "mined\|blocks/min\|b/s" "$L" | tail -8

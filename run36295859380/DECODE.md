# DECODE — run 36295859380 (the v0.235.0 tree, ae13a63) — first-hand additions
// Lane: cron37-20260927-1337. The 13:30 lane (cron30-20260927-1330) decoded the
// summary verdicts from their (since-deleted) sandbox; this lane re-downloaded
// the full fleet19.log (340737B) and mined the melee gallery's exact traces.
// Fleet verdict: COMPLETED SUCCESS, alive 19/19 at the end, mined=3383 (5.64 b/s).

## The death ledger (11 deaths, first-hand server kinds + inference verdicts)

| # | Bot | Server kind | Inference | Pos (y) | trace line |
|---|-----|-------------|-----------|---------|------------|
| 1 | F19 | drowned | contradicts (zombie@14.2) | 51 | 1523 |
| 2 | F8  | explosion by Creeper | contradicts | 64 | 3077 |
| 3 | F12 | slain by Zombie (Villager) | contradicts (zombie_villager@1.2) | 62 | 3109 |
| 4 | F10 | slain by Zombie | contradicts (zombie_villager@0.6) | 64 | 3214 |
| 5 | F9  | shot by Skeleton | corroborates (@1.0) | 66 | 3276 |
| 6 | F4  | slain by Zombie | corroborates (@0.7) | 65 | 3286 |
| 7 | F8  | slain by Zombie | corroborates (@1.3) | 65 | 3306 |
| 8 | F19 | drowned | contradicts (zombie@14.2) | 59 | 3320 |
| 9 | F16 | slain by Zombie | corroborates (@0.8) | 63 | 3366 |
| 10 | F11 | slain by Zombie | corroborates (@1.4) | 64 | 3575 |
| 11 | F2  | slain by Zombie | corroborates (@0.8) | 66 | 3606 |

Zombie melee x7 + skeleton shot x1 (a skeleton at MELEE range 1.0) + drowned x2 + creeper x1.
ALL 9 surface mob deaths at y=62-66, clustered late in the run — the yard night wave.

## THE PAIR TRADE ANATOMY (the x7 class, the v0.236.0 front)

Every dead bot fought a pair AT REACH while the verdict counted the DETECT_RANGE census:

- F12: `fighting zombie_villager (dist 2.0, hp 13.0, 2 nearby, sentry)` → hp 13.0→4.0 in ONE
  sentry gap (9 hp ≈ 2x zombie swings over ~2s) → `verdict flipped to flee (hp 4.0)` →
  `shelter skip (open field: no diggable wall, zombie@1.2)` → ring try → `ring incomplete 3/8` → dead.
- F8: open at 20.0 vs `zombie_villager (dist 3.8, 2 nearby)` → flip at 6.3 → `ring not buildable
  [-B -o -B Bo]` → flee bearing rotated 270deg x2 (water/hazard vetoes) → dead.
- F10: UNARMED lane (pickaxe only) — pre-fight shelter ran FIRST (`proximity pre-fight`),
  read `no diggable wall` then `ring incomplete 6/8`, THEN fought at 5.3 → dead.
- F4: `fighting zombie (dist 2.3, hp 10.3, 1 nearby)` — a LONE zombie drained 10.3→7.3, flip,
  `ring incomplete 1/8` → dead (the land-line class, not the pair).
- F16: trio at 19.0 → the SWARM lane flipped at 13.0 → `ring not buildable [-o -o Bo -o]` →
  flee bearing rotated 180deg x2 → dead (the flee-path terrain class).
- F11: fought at 14.8 (3 nearby), 1 swing, drift-waited, ended `verdict ignore` at hp FLAT
  14.8 — then the re-engage (no episode) killed it: shelter skips at zombie@0.8 → dead.
- F2: no combat episode at all — shelter skip `(1,0: cells not free)` mid-walk → dead @0.8.

## THE COUNTER-WEIGHT (the discriminator)

F18: `fighting zombie (dist 3.3, hp 20.0, 3 nearby, proximity)` → `mob down, hp 20.0 -> 18.5,
swings 5, weapon wooden_sword, 5 rounds`. WON. The extras sat at 5.3/7.5 — OUT of the melee
band (the drift-wait lines name them: `drift return wait vs zombie (@5.3)`, `(@7.5)`).
The DETECT_RANGE census (3) was never the DPS; the REACH band (1) was.

## The trade math (why the pair line lives at SWARM_FLEE_HP 14)

Wooden sword 4-5 dmg, 0.65s full-charge cadence → one zombie (20 hp) needs ~3.2s of swings.
A pair in reach deals ~2x2.5=5 hp/s → over that kill window the pair deals ~16. At hp 13-14
the trade ends at 0; at hp 20 it ends at ~4 (the F8 shape). Two in reach below 14 = a losing
trade BY ARITHMETIC; one in reach = the F18 win class. The flee fired AT 13.0 buys 9 hp of
run margin vs the measured flip at 4.0.

## The v0.236.0 cure (shipped this fire)

combat.mjs: PAIR_SIZE=2 + the verdict's `attackersClose` input (hostiles within
ENGAGE_RANGE) + the pair line after the legacy swarm check (`crowdClose >= 2 && seen < 14`
→ flee, lane 'pair-trade'); threatVerdictLane mirrors. miner.mjs: countHostiles(range)
parameterized, all four verdict/lane sites pass `attackersClose: countHostiles(ENGAGE_RANGE)`.
Junk-safe: missing/junk close census reads 0 → every legacy verdict byte for byte.

## Other faces (confirming the 13:30 lane's read)

- Freeze-storm early-kill: NOT exercised — 0 probes, 0 FATAL (6th clean run).
- doomedRearm x0 (5th straight). Breaker 20 bites all honest 'sweep drops'.
- Banking 6/6 positive but thin: banked=133, pocket 2522u, 18 'pockets full' trips planned,
  49 end-phase deadline-skips (`145s left < 150s`) — the end-phase owns the late banking.
- Dusk family BOTH-SILENT 1st time (no 'bank trip: dusk', no 'dusk-plan').
- F19 drowned x2 — both `inference blind` (the water lens's documented blindness).

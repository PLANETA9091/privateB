# run36289053811 - the 0.232.0 tree's field face (mined by the 11:00 lane, artifacts committed by the 11:37 lane)

FLEET RESULT: normal end 600s, alive 19/19 (11-straight), mined=3302 (5.50 b/s), map 1520p/21ch, banked=744 (the series 0 -> 286 -> 0 -> 1926 -> 744 - 2/2 positive, banking STABLE, the amplitude tracks the chest distance), smelted=21, unaccounted=843, conversion 74.5%. Rescues=46, wet=12.

## THE DEATH LEDGER (11) - the full verdict distribution

| # | bot | server verdict | inferred hint | verdict class |
|---|-----|----------------|---------------|---------------|
| 1 | F13 | drowned [drown] | fall/env | blind (noise by construction, v0.218.0) |
| 2 | F16 | drowned [drown] | fall/env | blind (noise by construction, v0.218.0) |
| 3 | F15 | drowned [drown] | drowned@13.6 | CONTRADICTS (plain drown has no attacker; a nearby Drowned is a witness, not the oxygen) |
| 4 | F10 | was blown up by Creeper | zombie@7.8 | bystander (the exploder removed itself, v0.224.0) |
| 5 | F3 | was shot by Skeleton | skeleton@2.1 | corroborates |
| 6 | F2 | was impaled by Drowned | drowned@7.8 | corroborates |
| 7 | F13 | was impaled by Drowned | drowned@13.3 | corroborates |
| 8 | F18 | was impaled by Drowned | drowned@9.4 | corroborates |
| 9 | F8 | was shot by Skeleton | drowned@9.1 | CONTRADICTS |
| 10 | F14 | was impaled by Drowned | drowned@13.6 | corroborates |
| 11 | F5 | was impaled by Drowned | skeleton@0.2 | CONTRADICTS |

Distribution: corroborates x5, blind x2, contradicts x3, bystander x1. The impale ATTRIBUTION is healthy (4/5 corroborated) - the lens is not the front. The F8/F5 contradictions are the ranged-kill nearest-harm miss (the trident/arrow came from beyond the melee scan's answer).

## THE IMPALE BURST (log lines 2892-2967): the night ambush zone

All five impale deaths + F8's skeleton shot cluster at y=64-66, x=-111..-125, z=384..405 (~20 blocks). Mixed threats: trident drowned at standoff + skeletons + zombies. The killer sequence, verbatim:

- F2: 'shelter try vs drowned (7.8, sentry)' -> 'shelter skip (open field: no diggable wall)' -> 'shelter ring try vs drowned (+z+x-x-z first, FULL ring)' -> died mid-ring ('ring incomplete 4/8' printed after). F2 was UNARMED (the unarmed-band flee at hp 20 - the flee verdict ran tryShelter FIRST, the 8-cell ring burned the window).
- F8: 'shelter ring try vs drowned (9.1, full ring)' -> died mid-ring ('incomplete 3/8') - shot by a SKELETON while walled against the drowned (the cross-killer).
- F14: 'shelter try' -> skip -> 'ring not buildable [oo oo -o oo]' -> 'fleeing drowned (hp 4.0)' -> died - three shelter attempts ate the window from hp 20 to 4.0 (two trident hits).
- F13: died at drowned@13.3 with NO combat lines - outside the 12-band, the verdict was 'ignore', the shooter's reach exceeded every band.
- F18: died at drowned@9.4, no combat lines in the window - the ignore-path shape (hp >= 14 stands).

## THE ROOT: the ring's ranged mode never reads the trident

miner.mjs tryRingShelter: `const ranged = RANGED_HOSTILES.has(threat.name) && threat.name !== 'witch'` - the drowned is NOT in RANGED_HOSTILES (deliberate: the v0.215.0 fight hybrid keeps the swimmer contracts), so the trident shooter built the FULL ring (all-4-sides gate, 8 cells) and died mid-build. v0.140.0's own argument applies verbatim: a LOS killer is not refused by walking; the arrow wall (2 threat-side cells) breaks the trident's line of sight the same way it breaks the arrow's, and the 2-cell gate builds inside the window the 8-cell build burns (F5's completed 5/8 arrow wall DID shelter vs the skeleton - the ranged-mode ring works where it stands).

THE CURE (v0.234.0 THE TRIDENT STANDOFF RING): combat.mjs ringRangedClass - the drowned joins the ring's ranged mode ONLY in the standoff band (dist > ENGAGE_RANGE 5: the measured kills at 7.8/9.1/9.3/13.3), the close band (<= 5) keeps the full ring (the swimmer walks in through a gap - the v0.174.0 drift-wait terrain), the fight verdict stays byte for byte (threatVerdict vs drowned@7.8 hp 20 still 'ignore'). 7 new pins (trident-standoff-ring.test.mjs) + the v0.140.0 miner pin follows the predicate call.

## THE HONEST ZEROS (the 11:00 lane's read, confirmed)

doomedRearm x0 (the climb re-arm's field face still unsampled - no rise-assist event), dusk-plan arms x0 (0.232.0 tree - expected), storm 0 probes, pf:spin x0. The breaker: 63 bites all real 'sweep drops'; the chest-hop identity held across cross-bot refusals on one key ('iron commune walk @-117,405' refused by F5 AND F8, no 30s hold).

## WATCH LIST for the next decode (the 0.234.0 field face)

- 'shelter ring ranged mode: ... vs drowned@N' - the standoff ring's arm lines (the cure's volume; the full-mode 'ring try vs drowned' lines must stop at dist > 5).
- 'arrow wall incomplete vs drowned' / 'sheltering from drowned (arrow wall, ...)' - the outcome split.
- The impale count vs 5 (the cure's verdict) and the mid-ring death class (must go silent).
- F13@13.3/F18@9.4 ignore-path deaths: the standoff-FLEE candidate (0.235.0's front) - if the impales survive the ring cure through the ignore path, the any-hp standoff flee design gets its evidence.
- The trident ARC question: the arrow wall breaks arrow LOS by measurement; the trident flies flatter - the wall's 2 cells may leak. The field decides.

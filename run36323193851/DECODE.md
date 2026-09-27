# run36323193851 - the v0.243.0 SHORE LAW + v0.244.0 SEAL CENSUS field face (mined by the cron30-20260927-2230 lane)

Run: 36323193851, head 876a7aa (v0.244.0 census on top of the v0.243.0 shore law), workflow_dispatch, COMPLETED SUCCESS.
Artifacts: fleet19-log (10933877175), fleet-server-log (10933812456), fleet-logs (10933382070). Fleet phase ran ~15 min wall (600s budget + yard + settle + tee tail) - NOT a hang: the 22:00 lane's 'stuck' call was premature (read at minute 8); the v0.246.0 breaker stays as insurance (the 18-min cap holds a 3-min margin over the measured 15).

## THE CENSUS HEADLINE: 16/16 ARMED

- `water-lock census` fired **16x** (`is water-locked` 16x): **water 16/16, lava 0,
  ARMED 16/16, bare 0** - the pocket carried 2-131 sealable blocks at EVERY lock
  (top stacks: cobblestone x8ish, granite x67, andesite x131, dirt x2).
- THE VERDICT: the seal-and-cross placement cure is REAL - the material RIDEs
  with the bot; the bring-stock class is EMPTY. The v0.245.0 geometry's
  'seal plan:' lines debut in the NEXT face (ee59ef0) - buildable/walled/
  unanchored/unknown decides the wiring.

## THE SHORE LAW: verified

- `combat: flee toward shore` 4x (ALL vs drowned, the aquatic class) -
  `no verified shore cell` = 0 (the verify always found the bank).
- `flee bearing rotated` 16x - ALL the land-veto legacy form
  ('water/hazard vetoes the away target') vs zombie/spider/drowned-on-land:
  legal, not the 270deg wet-arc class. No wet-arc rotated observed.

## THE FIELD: a top-tier run

- alive 19/19, banked **1712** (2nd best all-time, vs 1672 the record),
  smelted **32**, reconnects 9, kicks 0, climbs 31, torched 9.
- **fights 53, kills 7** - the fight wash BROKEN (0/9, 0/9 the prior two;
  the v0.169.0 kill ledger finally landed kills in the field).
- deaths 15 respawned: **water 2/15 (drowned x2)** - the water class COLLAPSED
  from 6/7 to 2/15 (the shore law + the census era); **Zombie 4+** is the new
  leader (slain by Zombie x4), Skeleton 1 (back after eras), Creeper 1.
- airGlitches **940** (still era-high, vs 550/1064).
- the server GC log ends 'G1 Evacuation Pause (Evacuation Failure: Pinned)
  909M->337M(1024M)' - the 1GB server heap pins during the fleet; the
  tick-stall evidence for the CI-era storm hunt lives here.

## What the decode counts next (the v0.245.0 geometry face, 36325553310)

- `seal plan:` lines - the buildable/walled/unanchored/unknown split (the
  placement cure's field verdict, riding ON TOP of 16/16 ARMED).
- the census continuation (ARMED vs bare), the shore volume, banked vs 1712,
  deaths vs 15 (Zombie 4+), kills vs 7, airGlitches vs 940.

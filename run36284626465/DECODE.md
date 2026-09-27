# run36284626465 — the 0.231.0 FIELD FACE (the chest-hop identity + the OOM rerun)

Dispatch 36284626465 (workflow_dispatch, b379368 = the 0.231.0 tree, 01:08:32Z) —
**COMPLETED SUCCESS**: units 22+24 green, integration green, the Big fleet job
ran the FULL 600s and ended `normal end - deadline 600s reached`. The OOM
alloc-storm did NOT repeat (max rss 442M vs the 3000M ceiling; 0 stormguard
strikes; 0 alloc-valve closes; no pf:queue/pf:goal/pf:done storm ring).

## The chest-hop identity face — CURE VERIFIED

The coords-label law (v0.231.0) is LIVE in the field: the commune walk reads
`iron commune walk @-119,415` (F13, timeout after 2187ms — a walk failure,
NOT a breaker hold). The breaker's catch list this run: **14 catches, ALL
real 'sweep drops' bites** (F2 x4, F6, F10, F14, F9, F19 x2, F1 x2, F17 x2) —
the 'iron commune walk' FALSE POSITIVE is GONE (run 36280122123 caught it 1x).
The fuel-commons sibling label likewise never armed a hold. The chest-hop
identity is verified: different chests are different breaker keys; same-chest
stalls keep containment.

## The dusk-plan arms face — honest no-time

`bank trip: planned` x8, `bank trip: pockets full` x6, end-phase skips x7+
('the end-phase owns the deadline banking'), **`bank trip: dusk-plan` x0**.
The wiring's honesty held: no DELIVERED bank trip all run → lastBankTripMs
stayed NaN → duskBankPlan refused 'no-time' every pass — it never priced a
guess. (The dusk window itself was likely unreached too; the run is 600s.)
The 0.231.0 wiring face = zero arms BY DESIGN, not by dead-wire.

## THE NEW ROOT — the vertical gate (banked=0)

mined=3742 (6.24 b/s, 374/min) but **banked=0**, pocket 1763u/148s stranded,
conversion 47.4%. The bank chain armed 14+ trips and delivered NOTHING:

- The fleet dug DEEP (shafts y=41-55; the yard/chests sit y~80-82): the yard
  stands 37-39 levels up over 11-34b lateral — the strict verticalDoomPlan
  geometry (lat < dy) on every chest walk.
- The walk ladder honestly refuses the doomed geometry ('the walk ladder
  cannot climb, the fragments ride'; F2 fuel anchor refused by the vertical
  gate).
- The CLIMB machinery (dig-a-staircase-up) is the struggling edge:
  'climb out (trip): failed - stalled' (F7); 'climb diag: level at y=65
  blocked toward ... (dug=57)' — digging heavily, not rising; 'did not rise
  (food=20, dug=7) feet=air support=andesite' (F14); 'climb bridge: the
  server refused the support fill'; F10 'post=water STILL THERE (server
  never broke it)' — a dig target cell is water the server never cleared.
- **THE CROSS-SYSTEM KILL (v0.232.0's cure)**: F14 mid-climb y=53-54 (dug=7,
  the staircase MOVING) read 'climb rise assist: assist did not complete
  (goto: doomed goal (ledgered 5s ago at [-114,53,406]) - climb rise assist
  refused)' — the doomed ledger's DOOMED_GOAL_RADIUS=2 verdict on a failed
  WALK ate the climb's own 1-2-block dig-verified assist. The climb lost its
  momentum mid-rise and stalled; the pockets stayed underground.
- The end-phase could not rescue either: F3 'final bank: 0 (chest
  unreachable (walk governor: bot churned 4 goals without progress))'.

## The other faces this run feeds

- Deaths 2 (late): F3 by Skeleton (server verdict; the nearest-harm inference
  CONTRADICTS it — the ranged-kill class feeds again), F14 by Zombie
  (corroborated). server guard losses=2, window 0/10.
- F12 water airGlitches=352 (sentry g352/r11), liar ladder confirmed no-op
  glitch page #7 — the override/rescue cycle works but the glitch volume is
  the front.
- F5 'wood trip: famine (sticks 2 planks 1 logs 0) - gathering' — the
  wood-famine face again.
- 'F14 fuel anchor: 0 delivered (walk failed (Took to long to decide path to
  goal!))' x2 — the fuel commons walk's decide-timeout face (distinct from
  the vertical-gate refusals).
- Productivity otherwise strong: tools=15 recovered=7, upgraded=24, swords=18,
  fights=32 kills=2 shelters=5 rescues=27, worldmap 1186p/21ch, plan progress
  2/31. sweep ledger: sweeps=37 picked=224u failed=106 (below x26, plane x26,
  above x54) deepSkip=30. doomed-goal: 276 recorded / 1037 refused / 18
  re-dooms absorbed / 8 live. walk governor 4 stalls / 8 refusals; goal brake
  6 bursts / 28 refusals; storm duck 0.

## The dispatch queue

0.232.0 THE CLIMB RE-ARM (this tree): the rise assist walks with
doomedRearm: true — the dig pass's fresh ground truth outranks the stale
walk-geometry verdict; the re-arm is counted; a genuinely dead cell still
fails honestly into the rotate ladder. The field face wanted: the rearm
counter's first materialization in the FLEET RESULT + the climb-out
stall rate vs this run's baseline (F5/F7/F14 class), banked > 0.

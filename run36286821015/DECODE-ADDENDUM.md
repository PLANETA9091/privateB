# run36286821015 — DECODE ADDENDUM (the 10:37 lane): the dusk-plan calibration read

The 10:30 lane's fast decode named 'dusk-plan x0 (the honest no-time refusal
held)' and left 'why the plan never armed' as the 0.233.0 question. This
addendum answers it with the run's own log + the plan's arithmetic.

## THE ANSWER: the fixed window is 80s wide; the field's chains are 156-184s+

- The fixed dusk window (DUSK_BANK_START_TICKS 10800 → DUSK_BANK_NIGHT_TICKS
  12400) is 1600 ticks × 50ms = **80 seconds** — the max priceable trip is
  80s − 15s safety = **65s**.
- The run's actual bank chains priced **156-184s at the arm** ('bank trip:
  planned/dusk/pockets full budget 156-184s' x15) — and the full delivered
  chain (climb out + yard walk + smelt + deposit + RETURN walk, which is
  what the wiring's lastBankTripMs measures) reads longer still.
- So the 0.230.0 dusk-plan's 'no-time' refusal fired **by arithmetic, on
  every pass, before the fit test ever had a chance** — the honest refusal
  held, but the plan was structurally unreachable for the deep-dig fleet.
  Not a dead wire: a law-abiding plan priced out of existence by its own
  window shape.

## THE DUSK FAMILY DID DELIVER (the 10:30 lane's read refined)

- `F15 bank trip: dusk budget 156s` (line 1136) → `F15 bank: +32` (line
  1452) — **the legacy dusk-armed trip DELIVERED**.
- `F2 bank trip: dusk budget 157s` (line 1145) → `F2 bank: +27` (line
  1525) — **the second dusk-armed trip DELIVERED**.
- The full delivery ledger (the 'bank: +N' lines): F15 +32, F14 +90, F2 +27,
  F10 +151, F1 +232, F6 +191, F4 +208, F5 +222, F17 +188, F11 +228, F7 +168,
  F12 pre-position +160, F6 final +29 — 13 delivered chains feeding
  banked=1926. The legacy lanes (planned x10, dusk x2, pockets-full) own
  every delivery; the 4th label ('dusk-plan') stayed absent for the
  arithmetic reason above.
- The delivery mechanics that worked: the smelt-hold skip ('no fuel in
  pocket (coal 0)') kept chains moving, the yard walk recovered from one
  NoPath (F8's retry walked back honestly), the 'no chest in range' zero
  (F8) named itself per the v0.16.4 law.

## THE CURE (v0.233.0 THE TRIP-FIT WINDOW, this tree)

The plan's window now opens trip-relative for trips that cannot fit the
fixed 80s budget: the last-fit moment (night − (trip + safety)) minus the
consult-cadence margin (DUSK_BANK_EARLY_MS = 60s — one shaft cadence, so a
work-loop pass can actually CATCH the window). Trips that fit the fixed
window keep it byte for byte; the fit test stays the gate (a pass whose
remaining daylight cannot cover trip + safety still refuses 'no-time'); a
trip the whole day cannot cover refuses at every tod; junk tripMs keeps the
fixed shape. The wiring is untouched (the no-hardcoded-clocks law holds —
the windows live in duskbank.mjs alone). The night hold stays untouchable
(12400 = 12400, the fit never lands a bot past the threshold).

## The field face the NEXT decode wants (the re-dispatched 0.232.0/0.233.0 tree)

- The doomedRearm verdict: grep 'climb rise assist' — F14's mid-climb
  dig-verified assist should re-arm now (the 0.232.0 cure's field face).
- The banked series' 2nd sample: does the 1926 repeat or was the chest
  proximity lucky.
- The dusk-plan arms ('bank trip: dusk-plan' — the 4th label): with
  0.233.0 aboard, a measured long trip finally has a window to arm in.
- The climb series' stall rate vs the 36284626465 baseline (F5/F7/F14
  'climb out: failed - stalled').

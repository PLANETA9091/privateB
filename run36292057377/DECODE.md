# run36292057377 — the OOM storm's 3rd materialization, THE FREEZE-STORM ANATOMY

Run: 36292057377 (workflow_dispatch, 57b57f5 = the v0.234.0 tree, fleet_seconds=600).
Result: FAILURE. The OOM storm class, third materialization (run53/35647216505,
run92/35829873166, now this) — and the first one mined with the full
v0.143.0+ instrumentation live, which is what turns it into a pattern read.

## The timeline (fleet19.log, 86 lines — the whole run)

- t=21..161s: healthy. rss 247-367M, heap 96-112M/137-140M, mainLate 0-2469ms
  (the known long-think band). `path=6a/11q (max 6)` → `6a/10q` → `6a/9q` →
  `6a/7q` → `6a/8q` → `6a/7q` → `6a/4q` — the semaphore ACTIVE slot pinned at
  its max 6 the whole time, the queue oscillating 4-11.
- t=181s ([hb] n=9): rss=367M, mainLate=2190ms — the last live parent reply.
- t=201/221/241s (n=10/11/12): rss=367M FROZEN, mainLate=2190ms FROZEN
  (exactly identical across three beats) — the parent stopped replying; the
  worker printed the stale value. The main thread entered a ~65s SYNC LOCK.
- ~t=246s: `[stormguard] STORM PROBE: rss 1154M -> 2271M (+1117M in 5s =
  223MB/s, mainLate 2190ms ...)` — the free first strike, spent.
- next tick: `[stormguard] FATAL (hard ceiling 3000M): rss 2271M -> 3094M
  (+823M in 5s = 164MB/s ...)`. The SIGTERM LOST the race to the V8 OOM —
  the CI verdict records exit 134 (Reached heap limit), not the guard's 143.

## The three discoveries this log adds to the pattern

1. **THE STALE mainLate.** mainLate frozen at EXACTLY 2190ms across four
   beats is not a measurement — it is the last postMessage value repeating.
   The probe line's "mainLate 2190ms" read as if the main were turning; it
   had been locked for a minute. The lag probe (250ms) is itself a main-thread
   casualty: its silence IS the freeze signal, delivered through the value's
   staleness.

2. **THE STALE RING.** The probe's and the FATAL's blackbox rings are
   byte-for-byte IDENTICAL (`pf:spin walk @+0.0s <- pf:queue walk @+-0.1s <-
   ... <- pf:goal walk @+-4.5s`). The ring is written by the main thread; a
   frozen main means the newest entry predates the kill by a minute. The
   "+0.0s" is relative to the ring's own newest entry, NOT to the print
   moment — a marching-looking ring in a FATAL line is a freeze signature,
   not liveness. (The 12:00 lane's first read called the ring's pf:spin notes
   the gold sample; the deeper gold is that the ring was STALE.)

3. **THE QUEUE-ARM BLINDNESS IS HONEST.** The v0.115.0 queue-pressure arm
   (queued >= 10 for 30 consecutive 1s ticks) saw 11q once and 10q once —
   never sustained. The queue oscillated INSIDE the healthy run100 shape
   (10-11q peaks) while the ACTIVE slot sat pinned at max. A lowered bar
   would false-close every healthy run. The queue is not the signal here.

## The gap the cure closes (v0.235.0 THE FREEZE-STORM EARLY KILL)

The pulse evidence was live on the worker for ~60s BEFORE the burst: the
v0.143.0 pulse-void read (frozen >= 4s) fired on every 5s guard tick from
t~186s. But the void check lived only INSIDE the grace (the second verdict's
path), and at 223MB/s the first verdict is 40s away and the ceiling point is
the V8 cliff itself — the free probe spent 5s and 1.1GB of headroom on a dead
premise, and the ceiling SIGTERM raced the OOM and lost (exit 134, story
erased — the exact outcome the guard exists to prevent).

The cure: the freeze-storm check runs BEFORE the two-strike policy on every
guard tick — frozen pulse >= the void threshold + rss past the 1200M floor +
strictly growing over the previous sample = kill at once, named reason, exit
143. On this run's shape the kill lands at 2271M instead of 3094M, ~800M and
~5s ahead of the ceiling point. The recoverable classes are untouched: a FLAT
frozen rss (367M for 60s — this run's own pre-burst state, and run63's 51s
freeze that resolved) never kills; a turning main (pulse alive) keeps the
two-strike + grace path byte for byte; junk/absent pulse evidence never kills.

## The watch list for the next field face (the 0.235.0 dispatch)

- `[stormguard] FATAL (freeze storm: ...)` — the early kill's field form, OR
- zero freeze-storm kills AND a normal end — the freeze class did not recur
  (the storm is episodic-per-tree; three materializations in ~20 runs)
- the flat-freeze survivor: `[hb]` beats with a frozen identical mainLate
  followed by a NORMAL end — the cure's restraint face (no kill on flat)
- the queue arm stays silent (6a/4-11q healthy shape) — the blindness read
  holds.

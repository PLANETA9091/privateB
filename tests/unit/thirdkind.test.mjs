import assert from 'node:assert/strict'
import { thirdKindSplit, thirdKindRow, thirdKindRowConsistent } from '../../src/lib/thirdkind.mjs'

// The v0.854.0 lens: the siege thirds join the server's own kind word.
// Face 128 (run 37867025314, the v0.852.0 tree) is the verbatim read:
// clockEnd 961, thirds 320.33s, early 0 / mid 4 (drown 3, mob 1) / late 5
// (mob 5) - the late third is MOB-CLEAN, the second consecutive late-heavy
// face prices the mob front, not the wet front.

const HB = (ts) => `b] n=1 ts=${ts}s rss=247M late=6ms mainLate=0ms`
const DROWN = (bot) => `${bot} [${bot}] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-127,49,401]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])`
const MOB = (bot, name) => `${bot} [${bot}] died - respawning (cause: server: was slain by ${name} [kind=mob by ${name}] | inferred: ${name.toLowerCase()}@0.8 (0s before death at [-148,57,440]) [the inference corroborates the server verdict])`

// The face-128 verbatim clock: 9 timed deaths, none unplaced.
const FACE128 = [
  HB(21),
  HB(341), DROWN('F19'), // ts 341 -> mid
  HB(381), DROWN('F16'), // ts 381 -> mid
  HB(461), DROWN('F19'), // ts 461 -> mid
  HB(481), MOB('F7', 'Zombie'), // ts 481 -> mid
  HB(721), MOB('F17', 'Drowned'), // ts 721 -> late
  HB(741), MOB('F5', 'Drowned'), // ts 741 -> late
  HB(821), MOB('F10', 'Skeleton'), // ts 821 -> late
  HB(901), MOB('F13', 'Drowned'), // ts 901 -> late
  HB(921), MOB('F14', 'Drowned'), // ts 921 -> late
  HB(961) // the face's own final hb owns the clock end
]

assert.deepEqual(
  (() => { const b = thirdKindSplit(FACE128); return { n: b.n, timed: b.timed, unplaced: b.unplaced, unparsed: b.unparsed, clockEnd: b.clockEnd, lateShare: b.lateShare, early: b.thirds.early.n, mid: b.thirds.mid.n, late: b.thirds.late.n, midKinds: b.thirds.mid.kinds, lateKinds: b.thirds.late.kinds, earlyKinds: b.thirds.early.kinds, midAtk: b.thirds.mid.attackers, lateAtk: b.thirds.late.attackers } })(),
  { n: 9, timed: 9, unplaced: 0, unparsed: 0, clockEnd: 961, lateShare: 56, early: 0, mid: 4, late: 5, midKinds: { drown: 3, mob: 1 }, lateKinds: { mob: 5 }, earlyKinds: {}, midAtk: { Zombie: 1 }, lateAtk: { Drowned: 4, Skeleton: 1 } },
  'face-128 verbatim fold'
)

// The row renders the verbatim seat: mob owns the face's end, the family
// fully named - the attacker's own word prices the water-edge storm.
assert.match(
  thirdKindRow(thirdKindSplit(FACE128)),
  /^the late third's own kind \(v0\.855\.0\): early 0 \(none\) \/ mid 4 \(drown 3, mob 1 \(Zombie 1\)\) \/ late 5 \(mob 5 \(Drowned 4, Skeleton 1\)\) - the late third owns 56% of 9 timed death\(s\) - THE LATE KIND'S OWN SEAT: mob owns the face's end \(5 of 5\) - the attacker's own word: Drowned 4 of 5$/,
  'face-128 verbatim row'
)

// (v0.855.0) The unnamed mob rides the bare kind honestly: no attacker
// detail in the parens, no attacker word in the seat, the fence holds.
const unnamed = [HB(900), 'F1 [F1] died - respawning (cause: server: was slain [kind=mob] | inferred: unknown)']
const ub = thirdKindSplit(unnamed)
assert.equal(ub.thirds.late.kinds.mob, 1)
assert.equal(Object.keys(ub.thirds.late.attackers).length, 0, 'the missing attacker word never invents a name')
assert.match(thirdKindRow(ub), /late 1 \(mob 1\) - the late third owns 100% of 1 timed death\(s\) - THE LATE KIND'S OWN SEAT: mob owns the face's end \(1 of 1\)$/, 'the unnamed mob row')

// The boundary second belongs to the LATER third (t < thirdS strict):
// clockEnd 961 -> 2*thirdS = 640.67 - ts 640 -> mid, ts 961 -> late.
const edge = [HB(640), DROWN('F1'), HB(961), DROWN('F2')]
const eb = thirdKindSplit(edge)
assert.equal(eb.thirdS, 961 / 3)
assert.equal(eb.thirds.mid.n, 1, 'ts 640 < 640.67 rides the mid third')
assert.equal(eb.thirds.late.n, 1, "ts 961 rides the late third")

// The honest silences: no clock, no deaths, junk, non-array.
assert.equal(thirdKindSplit([]), null, 'no announce = silence')
assert.equal(thirdKindSplit([DROWN('F1')]), null, 'no hb = no clock = silence')
assert.equal(thirdKindSplit([HB(100)]), null, 'clock with zero deaths = silence')
assert.equal(thirdKindSplit(null), null, 'null input')
assert.equal(thirdKindSplit(42), null, 'junk input')
assert.equal(thirdKindRow(null), null, 'null bill row')
assert.equal(thirdKindRow(42), null, 'junk bill row')

// The untimed death (pre-first-hb) rides unplaced honestly; the fence holds.
const pre = [DROWN('F1'), HB(300), DROWN('F2'), HB(600), DROWN('F3')]
const pb = thirdKindSplit(pre)
assert.equal(pb.unplaced, 1, 'the pre-hb announce never invents a ts')
assert.equal(pb.timed, 2, 'the timed count stays the timed count')
assert.equal(pb.n, 3, 'n counts every parsed kind')
assert.match(thirdKindRow(pb), /\(1 unplaced\)/, 'the unplaced note rides the row')

// The inferred-only family counts unparsed, never invents a kind (the
// lone unparsed row cannot fold alone - one timed kind rides the clock).
const inf = [HB(300), DROWN('F1'), HB(900), 'F16 [F16] died - respawning (cause: drowning (0s before death at [-122,48,403]))']
const ib = thirdKindSplit(inf)
assert.equal(ib.unparsed, 1, 'the no-server-verdict shape stays unparsed')
assert.equal(ib.timed, 1, 'the kinded rows fold normally')
assert.match(thirdKindRow(ib), /\(1 unparsed\)/, 'the unparsed note rides the row')

// A spread late third reads honestly (no seat).
const spread = [HB(900), MOB('F1', 'Zombie'), MOB('F2', 'Zombie'), DROWN('F3'), DROWN('F4')]
assert.match(
  thirdKindRow(thirdKindSplit(spread)),
  /the end's kinds spread - no kind owns the storm$/,
  'the spread verdict'
)

// An empty late third (all deaths early/mid) reads its own clean seat:
// clockEnd 900 -> thirds 300s; deaths at ts 100/200 both ride the early third.
const cleanEnd = [HB(100), DROWN('F1'), HB(200), DROWN('F2'), HB(900)]
assert.match(
  thirdKindRow(thirdKindSplit(cleanEnd)),
  /the late third stayed empty - the face's end was clean$/,
  'the clean-end verdict'
)

// The fence battery: a self-inconsistent shape never renders.
const good = thirdKindSplit(FACE128)
assert.equal(thirdKindRowConsistent(good), true, 'the face shape is consistent')
assert.equal(thirdKindRowConsistent({ ...good, timed: 8 }), false, 'thirds sum break')
assert.equal(thirdKindRowConsistent({ ...good, n: 10 }), false, 'n vs timed+unplaced break')
assert.equal(thirdKindRowConsistent({ ...good, thirds: { ...good.thirds, late: { ...good.thirds.late, kinds: { mob: 4 } } } }), false, 'kinds sum break')
assert.equal(thirdKindRowConsistent({ ...good, thirds: { ...good.thirds, late: { ...good.thirds.late, attackers: { Drowned: 6 } } } }), false, 'attackers exceed the mob count')
assert.equal(thirdKindRowConsistent({ ...good, thirds: { ...good.thirds, late: { ...good.thirds.late, attackers: { Drowned: 4, Skeleton: 1 } } } }), true, 'the face attackers pass')
assert.equal(thirdKindRowConsistent({ ...good, lateShare: 55 }), false, 'share break')
assert.equal(thirdKindRowConsistent({ ...good, timed: 0 }), false, 'zero timed break')
assert.equal(thirdKindRowConsistent({ ...good, thirds: null }), false, 'missing thirds break')

// Non-string rows judge nothing; a mixed junk log still folds.
const mixed = [42, null, HB(300), DROWN('F1'), 'junk line', HB(900), MOB('F2', 'Zombie')]
const mb = thirdKindSplit(mixed)
assert.equal(mb.timed, 2, 'the junk rows judge nothing')

console.log('thirdkind.test.mjs: all green')

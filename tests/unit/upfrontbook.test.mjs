import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUpfrontAscent, upfrontAscentCensus, upfrontAscentRow, UPFRONT_RE, UPFRONT_BOOK_TORN_RE, UPFRONT_LAND_SHARE } from '../../src/lib/upfrontbook.mjs'

// The live face's own lines (fleet 37184982755, ae8ab88 = v0.602.0) -
// byte-exact against the held log ci-logs/fleet19-37184982755/.

test('the upfront family parses: the funded ask rides the plan why byte for byte', () => {
  const p = parseUpfrontAscent("F2 chest ascent (upfront): the yard stands 16 levels up - the climb buys the walk its route - funding the climb before the leg's walks")
  assert.equal(p.kind, 'funded')
  assert.equal(p.bot, 'F2')
  assert.equal(p.dy, 16)
  const deep = parseUpfrontAscent("F1 chest ascent (upfront): the yard stands 37 levels up - the climb buys the walk its route - funding the climb before the leg's walks")
  assert.equal(deep.dy, 37)
  // The bracket-tagged shape rides the prefix law (the v0.600.0 correction):
  // the tag is optional, the bracket rides after the F-tag when present.
  const tagged = parseUpfrontAscent("F3 [abc123] chest ascent (upfront): the yard stands 12 levels up - the climb buys the walk its route - funding the climb before the leg's walks")
  assert.equal(tagged.kind, 'funded')
  assert.equal(tagged.bot, 'F3')
  // The riven ask rides the torn sweep, never the census.
  assert.equal(parseUpfrontAscent("F2 chest ascent (upfront): the yard stands 16 levels up - the climb buys"), null)
  assert.ok(UPFRONT_BOOK_TORN_RE.test("F2 chest ascent (upfront): the yard stands 16 levels up - the climb buys"))
})

test('the landed form parses: the real gain and the zero-gain lie, the ? fallbacks ride null', () => {
  const real = parseUpfrontAscent('F1 chest ascent (upfront): climbed +3 levels (dug 5, 2 steps) - the hop ladder is pre-funded')
  assert.deepEqual(real, { kind: 'landed', bot: 'F1', gained: 3, dug: 5, steps: 2 })
  const zero = parseUpfrontAscent('F8 chest ascent (upfront): climbed +0 levels (dug 0, 0 steps) - the hop ladder is pre-funded')
  assert.equal(zero.gained, 0)
  const dugOnly = parseUpfrontAscent('F1 chest ascent (upfront): climbed +0 levels (dug 1, 0 steps) - the hop ladder is pre-funded')
  assert.equal(dugOnly.dug, 1)
  // The emitter's own nullish fallback ('?') rides null, not NaN.
  const unknown = parseUpfrontAscent('F4 chest ascent (upfront): climbed +? levels (dug ?, ? steps) - the hop ladder is pre-funded')
  assert.equal(unknown.gained, null)
  assert.equal(unknown.dug, null)
  assert.equal(unknown.steps, null)
})

test('the failed form parses: the reason vocabulary, the greedy capture to the last paren', () => {
  assert.equal(parseUpfrontAscent('F2 chest ascent (upfront): failed (timeout) - the leg walks from here').reason, 'timeout')
  assert.equal(parseUpfrontAscent('F19 chest ascent (upfront): failed (stalled) - the leg walks from here').reason, 'stalled')
  assert.equal(parseUpfrontAscent('F1 chest ascent (upfront): failed (wet wall) - the leg walks from here').reason, 'wet wall')
  // The THROW form nests its own parens - the capture runs greedy to the
  // LAST paren (the walkfail book's v0.601.0 lesson).
  const nested = parseUpfrontAscent('F3 chest ascent (upfront): failed (some error (nested) here) - the leg walks from here')
  assert.equal(nested.reason, 'some error (nested) here')
  assert.equal(nested.kind, 'failed')
})

test('the route-latched form parses: the v0.321.0 latch speaks its own shape', () => {
  const p = parseUpfrontAscent('F1 chest ascent (upfront): route-latched after 3 refused climbs - the route is condemned, the leg walks the whole route')
  assert.deepEqual(p, { kind: 'route-latched', bot: 'F1', refused: 3 })
  assert.equal(parseUpfrontAscent('F1 chest ascent (upfront): route-latched after many refused climbs - the route is condemned'), null)
})

test('the junk battery: the doom family and the machinery lines never join the book', () => {
  // The DOOM hook's family ('chest ascent:' - verticalgate's emitter, a
  // DIFFERENT call site) must never claim membership here.
  assert.equal(parseUpfrontAscent('F18 chest ascent: failed (wet wall) - the skip stands'), null)
  assert.equal(parseUpfrontAscent('F12 chest ascent: climbed +9 levels (dug 12, 9 steps) - the hop gets its route'), null)
  assert.equal(parseUpfrontAscent('F18 chest ascent: refused (the clock 38s cannot fund the 45s climb + the 30s walk floor) - the skip stands'), null)
  // The climbOut machinery's own family (climbout.mjs's emitter).
  assert.equal(parseUpfrontAscent('F9 climb out (bank): OK +23 levels (23 steps, 40 dug, 51s)'), null)
  assert.equal(parseUpfrontAscent('F9 climb out (pre-position): failed - timeout (traversed 11)'), null)
  // The walkfail book's family and bare junk.
  assert.equal(parseUpfrontAscent('F9 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'), null)
  assert.equal(parseUpfrontAscent('chest ascent (upfront):'), null)
  assert.equal(parseUpfrontAscent(''), null)
  assert.equal(parseUpfrontAscent(null), null)
  assert.equal(parseUpfrontAscent(42), null)
  assert.equal(parseUpfrontAscent(['F2 chest ascent (upfront): the yard stands 1 levels up']), null)
})

test('the census: the live face 37184982755 reads additive - 13 funded, 7 landed, 5 zero-gain, 6 failed, 1 latched', () => {
  const lines = [
    // 13 funded asks (the face's own dy mix, synthetic bots riding the real counts)
    ...[16, 16, 16, 19, 19, 13, 13, 12, 12, 37, 20, 15, 14].map((dy, i) => `F${(i % 12) + 1} chest ascent (upfront): the yard stands ${dy} levels up - the climb buys the walk its route - funding the climb before the leg's walks`),
    // 7 landed climbs - FIVE rode +0 (the face's own lie)
    ...[0, 0, 0, 0].map((_, i) => `F${i + 2} chest ascent (upfront): climbed +0 levels (dug 0, 0 steps) - the hop ladder is pre-funded`),
    'F9 chest ascent (upfront): climbed +3 levels (dug 5, 2 steps) - the hop ladder is pre-funded',
    'F5 chest ascent (upfront): climbed +2 levels (dug 2, 3 steps) - the hop ladder is pre-funded',
    'F6 chest ascent (upfront): climbed +0 levels (dug 1, 0 steps) - the hop ladder is pre-funded',
    // 6 failed: timeout 4, stalled 2
    'F2 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F14 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F15 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F18 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F19 chest ascent (upfront): failed (stalled) - the leg walks from here',
    'F1 chest ascent (upfront): failed (stalled) - the leg walks from here',
    // 1 route latch + 1 torn riven
    'F1 chest ascent (upfront): route-latched after 3 refused climbs - the route is condemned, the leg walks the whole route',
    'F7 chest ascent (upfront): climbed +2 levels (dug'
  ]
  const c = upfrontAscentCensus(lines)
  assert.equal(c.funded, 13)
  assert.equal(c.landed, 7)
  assert.equal(c.zeroGain, 5)
  // (v0.609.0) THE FIELD-CORRECTED SPLIT: four of the five zero-gain climbs
  // rode (dug 0, 0 steps) - the honest already-out no-op; ONE rode (dug 1,
  // 0 steps) - the lie (digs burned, no rise).
  assert.equal(c.zeroDigGain, 1)
  assert.equal(c.alreadyOut, 4)
  assert.equal(c.failed, 6)
  assert.equal(c.latched, 1)
  assert.equal(c.torn, 1)
  assert.equal(c.gainedSum, 5)
  assert.equal(c.dugSum, 8)
  assert.equal(c.stepsSum, 5)
  assert.equal(c.maxDy, 37)
  assert.deepEqual(c.failures, { timeout: 4, stalled: 2 })
  assert.equal(c.botCount, 16)
})

test('the row bands: none, condemned, torn book, never-lands, zero-gain face, lands, misses', () => {
  // The none form is a verdict (and the torn none names the rivens).
  assert.equal(upfrontAscentRow(upfrontAscentCensus([])), 'upfront ascent book: none - the ascent never asked')
  assert.equal(upfrontAscentRow(upfrontAscentCensus(['F2 chest ascent (upfront): climbed'])), 'upfront ascent book: none - the ascent never asked (1 torn line(s) rode the family\'s name)')
  // The condemned leg: latched before any ask.
  const condemned = upfrontAscentRow(upfrontAscentCensus(['F1 chest ascent (upfront): route-latched after 3 refused climbs - the route is condemned, the leg walks the whole route']))
  assert.match(condemned, /the route is condemned - no climb asked/)
  // The torn book: outcomes without a funding ask.
  const tornBook = upfrontAscentRow(upfrontAscentCensus(['F2 chest ascent (upfront): failed (timeout) - the leg walks from here']))
  assert.match(tornBook, /the book reads torn - outcomes rode without a funding ask/)
  // The never-lands band: the top failure class names its throttle.
  const neverTimeout = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 30 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F2 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F2 chest ascent (upfront): failed (stalled) - the leg walks from here'
  ]))
  assert.match(neverTimeout, /the funding never lands - timeout owns the failures \(2 of 3\) - the funded clock burns dry - the per-level price reads short/)
  const neverWet = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 30 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): failed (wet wall) - the leg walks from here'
  ]))
  assert.match(neverWet, /the wet wall owns the climb - the geometry is the front/)
  // THE LIVE FACE ROW (v0.609.0 field-corrected): the already-outs own the
  // face (4 of 7 over the half) - the lie band never fires (1 of 7).
  const live = upfrontAscentRow(upfrontAscentCensus([
    ...[16, 16, 16, 19, 19, 13, 13, 12, 12, 37, 20, 15, 14].map((dy, i) => `F${(i % 12) + 1} chest ascent (upfront): the yard stands ${dy} levels up - the climb buys the walk its route - funding the climb before the leg's walks`),
    ...[0, 0, 0, 0].map((_, i) => `F${i + 2} chest ascent (upfront): climbed +0 levels (dug 0, 0 steps) - the hop ladder is pre-funded`),
    'F9 chest ascent (upfront): climbed +3 levels (dug 5, 2 steps) - the hop ladder is pre-funded',
    'F5 chest ascent (upfront): climbed +2 levels (dug 2, 3 steps) - the hop ladder is pre-funded',
    'F6 chest ascent (upfront): climbed +0 levels (dug 1, 0 steps) - the hop ladder is pre-funded',
    'F2 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F14 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F15 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F18 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F19 chest ascent (upfront): failed (stalled) - the leg walks from here',
    'F1 chest ascent (upfront): failed (stalled) - the leg walks from here',
    'F1 chest ascent (upfront): route-latched after 3 refused climbs - the route is condemned, the leg walks the whole route'
  ]))
  assert.equal(live, 'upfront ascent book: funded 13, landed 7, failed 6, latched 1 across 16 bot(s) - the ground called the climbs already-out - 4 of 7 landed climbs dug nothing and rose nothing - the plan\'s vertical read and the ground disagree')
  // The zero-gain LIE band: digs burned, no rise (the wet wall's graceful
  // exit) - the landed verdict lies.
  const lie = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    "F2 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): climbed +0 levels (dug 3, 1 steps) - the hop ladder is pre-funded',
    'F2 chest ascent (upfront): climbed +4 levels (dug 4, 4 steps) - the hop ladder is pre-funded'
  ]))
  assert.match(lie, /the zero-gain climb is the face - 1 of 2 landed climbs dug and rose no levels - the landed verdict lies/)
  // The already-out band: the honest no-ops own the face - the plan's
  // vertical read and the ground disagree.
  const ground = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    "F2 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): climbed +0 levels (dug 0, 0 steps) - the hop ladder is pre-funded',
    'F2 chest ascent (upfront): climbed +4 levels (dug 4, 4 steps) - the hop ladder is pre-funded'
  ]))
  assert.match(ground, /the ground called the climbs already-out - 1 of 2 landed climbs dug nothing and rose nothing - the plan's vertical read and the ground disagree/)
  // The wiring's own re-classification rides the failed family: the
  // v0.609.0 guard emits 'failed (zero-gain)' - the throttle names it.
  assert.equal(parseUpfrontAscent('F8 chest ascent (upfront): failed (zero-gain) - the leg walks from here').reason, 'zero-gain')
  const lieThrottle = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): failed (zero-gain) - the leg walks from here'
  ]))
  assert.match(lieThrottle, /zero-gain owns the failures \(1 of 1\) - the ok-without-rise is the front - the climb's ok hides a no-rise wall/)
  // The lands band: real gains over the half.
  const lands = upfrontAscentRow(upfrontAscentCensus([
    "F1 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    "F2 chest ascent (upfront): the yard stands 9 levels up - the climb buys the walk its route - funding the climb before the leg's walks",
    'F1 chest ascent (upfront): climbed +5 levels (dug 6, 5 steps) - the hop ladder is pre-funded',
    'F2 chest ascent (upfront): climbed +4 levels (dug 4, 4 steps) - the hop ladder is pre-funded'
  ]))
  assert.match(lands, /the funding lands - 2 of 2 funded climbs rose 9 levels/)
  // The misses band: landings under the half, zero-gain under the half.
  const misses = upfrontAscentRow(upfrontAscentCensus([
    ...[9, 9, 9, 9].map(dy => `F1 chest ascent (upfront): the yard stands ${dy} levels up - the climb buys the walk its route - funding the climb before the leg's walks`),
    'F1 chest ascent (upfront): climbed +1 levels (dug 1, 1 steps) - the hop ladder is pre-funded',
    'F1 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F1 chest ascent (upfront): failed (timeout) - the leg walks from here',
    'F1 chest ascent (upfront): failed (stalled) - the leg walks from here'
  ]))
  assert.match(misses, /the landings fall under the half - timeout owns the misses \(2 of 3\) - the funded clock burns dry/)
  // The boundary constant is exported and rides the exclusive-half law.
  assert.equal(UPFRONT_LAND_SHARE, 0.5)
  assert.ok(UPFRONT_RE instanceof RegExp)
})

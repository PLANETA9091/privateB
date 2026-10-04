// (v0.625.0) THE HONEST SECS - the climb out OK verdict prices itself.
//
// MEASURED (fleet 37212035127, the 0.623.0 lens tree's own face, COMPLETED
// SUCCESS): 'F16 climb out (trip): OK +11 levels (14 steps, 27 dug,
// undefineds)' - the emitter prints `${r.secs?.toFixed(0)}s` and the
// WALKABLE-SURFACE return paths carried no secs, so the template
// interpolated the literal 'undefineds' (the held logs' own shape:
// climbout.mjs's CLIMB_OK_RE grew a dedicated undefineds arm for it, and
// the lens keeps the climb counted while its price stays out of the secs
// sum - secs null, the stamp never invents). The climbout lens's
// ~4.2s/level pricing (the v0.294.0 doctrine) loses every such row.
//
// THE CURE is source-side, in climbOut itself: both walkable-surface OK
// returns (the blocked-step guard's and the rise-failure mirror's,
// v0.610.0 pair) now carry `secs: (Date.now() - start) / 1000` - the same
// clock the main return has priced itself with since v0.21.0. The emitter
// and the lens stay byte for byte: the emitter's optional-chaining keeps
// printing a real Ns, the lens's undefineds tolerance stays for the HELD
// history (the old faces must keep parsing; nine such lines across three
// held faces).
//
// These pins read the SOURCE (the dead-wire class - a return shape the
// unit mocks cannot reach, climbOut needs a live bot; the dusk-wiring
// precedent: only the call site can prove it).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseClimbOut, climbOutCensus } from '../../src/lib/climbout.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

const SECS_RETURN = "return { ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed, secs: (Date.now() - start) / 1000 }"

test('REGRESSION PIN: both walkable-surface OK returns carry the climb clock (the dead-wire class - the live-bot shape only the source can prove)', () => {
  const hits = minerSrc.split(SECS_RETURN).length - 1
  assert.equal(hits, 2,
    'exactly two returns price themselves: the blocked-step guard (v0.610.0, the (blocked step) log) and its rise-failure mirror - the main return below already carried secs since v0.21.0')
})

test('REGRESSION PIN: no secs-less walkable-surface return remains (the undefineds face dies at the source)', () => {
  const bare = minerSrc.match(/return \{ ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed \}/g)
  assert.equal(bare, null,
    'a secs-less OK return would re-print the literal undefineds on the next field face - none may remain (String.match reads null, never undefined, on an empty field)')
  // the ONLY secs-less ok returns left in climbOut are the failure-ish
  // families (the emitter never prints secs on them: the failed line reads
  // reason/wait/stage) - spot the two biggest: low-o2 and wet-sentinel
  assert.ok(minerSrc.includes("return { ok: false, reason: 'low-o2', gained: 0, dug, steps, traversed }"),
    'the failure families keep their shape byte for byte (no drive-by widening)')
})

test('REGRESSION PIN: the emitter keeps its optional-chaining shape (the fix rides the result, never the printer)', () => {
  // the template nests its own backticks (the traversed ternary) - the pin
  // matches the PREFIX and counts the secs interpolations, never crossing
  // the inner backtick (a [^`]* body would stop at the nest)
  const okLine = fleetSrc.match(/console\.log\(`\$\{name\} climb out \(\$\{reason\}\): OK \+\$\{r\.gained\} levels/)
  assert.ok(okLine, 'the OK emitter line exists in the fleet runner')
  const secsInterp = fleetSrc.match(/\$\{r\.secs\?\.toFixed\(0\)\}s/g) || []
  assert.equal(secsInterp.length, 2,
    'the secs interpolation stays optional-chained on BOTH OK lines (the retry emitter shares the tail): the held history prints Ns, a junk result prints undefineds - the lens tolerates both')
  assert.ok(fleetSrc.includes('retry OK +${r.gained} levels'), 'the retry OK emitter keeps its shape (the same tail, the same clock)')
})

test('CONTRACT PIN: the field face parses whole and the priced form joins the secs sum (the lens gains the row the source now sends)', () => {
  // the face's own line - the lens keeps reading the held history
  const held = parseClimbOut('F16 climb out (trip): OK +11 levels (14 steps, 27 dug, undefineds)')
  assert.equal(held.verdict, 'ok')
  assert.equal(held.secs, null, 'the held shape stays secs-null (the stamp never invents)')
  // the shape the fixed source now emits: a real integer secs rides
  const priced = parseClimbOut('F16 climb out (trip): OK +11 levels (14 steps, 27 dug, 57s)')
  assert.equal(priced.verdict, 'ok')
  assert.equal(priced.secs, 57, 'the priced form reads the clock')
  // and the census books it: secs.n grows, the sum carries the price
  const census = climbOutCensus([
    'F16 climb out (trip): OK +11 levels (14 steps, 27 dug, 57s)',
    'F9 climb out (trip): OK +14 levels (14 steps, 28 dug, 12 traversed, 38s)'
  ])
  assert.equal(census.secs.n, 2, 'both priced rows join the pricing')
  assert.equal(census.secs.sum, 95, 'the sum carries both clocks (57 + 38)')
  assert.equal(census.gains.sum, 25, 'the gains side stays whole (11 + 14)')
})

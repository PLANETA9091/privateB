import { test } from 'node:test'
import assert from 'node:assert/strict'
import { woodRefusalCensus } from '../../src/lib/climbrefusal.mjs'

// Face 28's live shapes verbatim (run 37438058900, the v0.690.0 tree's
// first face) - the refusal's why rides the climb line ONE line earlier
// (ensureSurface's own voice, the 1:1 shape).
const face28 = () => {
  const lines = new Array(1866).fill('F1 [F1] mem: ok')
  lines[704] = 'F1 climb out (wood trip): failed - timeout (traversed 8)'
  lines[705] = 'F1 wood trip: 0 (climb refused)'
  lines[716] = 'F3 climb out (wood trip): failed - wet-sentinel'
  lines[717] = 'F3 wood trip: 0 (climb refused)'
  lines[1534] = 'F1 climb out (wood trip): failed - wet wall'
  lines[1535] = 'F1 wood trip: 0 (climb refused)'
  lines[1864] = 'F1 climb out (wood trip): failed - rescue owns the bot'
  lines[1865] = 'F1 wood trip: 0 (climb refused)'
  // the lane's own noise must never join: an OK climb and another lane's fail
  lines[1113] = 'F18 climb out (wood trip): OK +3 levels (3 steps, 8 dug, 7s)'
  lines[900] = 'F1 climb out (bank): failed - stalled'
  return lines
}

test('woodRefusalCensus reads face 28 byte-exact: F1 owned 3 of 4 refusals, every why joined', () => {
  const r = woodRefusalCensus(face28())
  assert.equal(r.refused.n, 4)
  assert.deepEqual(r.refused.byBot, { F1: 3, F3: 1 })
  // the why-book: the reason class rides before the parenthetical
  // ('timeout' from 'timeout (traversed 8)'), the multi-word whys ride whole
  assert.deepEqual(r.refused.reasons, { timeout: 1, 'wet-sentinel': 1, 'wet wall': 1, 'rescue owns the bot': 1 })
  assert.equal(r.refused.unexplained, 0)
  assert.equal(r.climbFails.n, 4)
  assert.deepEqual(r.climbFails.byBot, { F1: 3, F3: 1 })
  // lane isolation: the bank lane's stalled fail never entered the wood book
  assert.deepEqual(r.climbFails.reasons, { timeout: 1, 'wet-sentinel': 1, 'wet wall': 1, 'rescue owns the bot': 1 })
})

test('woodRefusalCensus anatomy split: the unexplained refusal, the spent why, and the fail without a refusal', () => {
  const r = woodRefusalCensus([
    'F7 climb out (wood trip): failed - stalled',
    'F7 wood trip: 0 (climb refused)', // joined: stalled
    'F7 wood trip: 0 (climb refused)', // the why is spent - unexplained (the log cut or a non-climb path)
    'F9 wood trip: 0 (climb refused)', // no fail line ever - unexplained
    'F3 climb out (wood trip): failed - exhausted', // a fail whose refusal never prints (the log cut mid-pair)
    'F5 climb out (bank): failed - timeout' // another lane - never the wood book's input
  ])
  assert.equal(r.refused.n, 3)
  assert.deepEqual(r.refused.reasons, { stalled: 1 })
  assert.equal(r.refused.unexplained, 2)
  assert.equal(r.climbFails.n, 2)
  assert.deepEqual(r.climbFails.reasons, { stalled: 1, exhausted: 1 })
})

test('woodRefusalCensus honest zeros and the junk battery', () => {
  // a refusal-free face reads the honest zero shape (climb fails still
  // inventory - the fail anatomy is its own leg)
  const calm = woodRefusalCensus(['F1 climb out (wood trip): OK +8 levels (8 steps, 23 dug, 20s)'])
  assert.deepEqual(calm, {
    refused: { n: 0, byBot: {}, reasons: {}, unexplained: 0 },
    climbFails: { n: 0, byBot: {}, reasons: {} }
  })
  // the empty face
  assert.deepEqual(woodRefusalCensus([]), {
    refused: { n: 0, byBot: {}, reasons: {}, unexplained: 0 },
    climbFails: { n: 0, byBot: {}, reasons: {} }
  })
  // junk-safe: non-input reads null (the smeltledger convention)
  assert.equal(woodRefusalCensus(42), null)
  assert.equal(woodRefusalCensus(null), null)
  // junk lines inside a live face are skipped, never invented
  const j = woodRefusalCensus(['wood trip: 0 (climb refused)', 'F1 climb out (wood trip): failed', 123])
  assert.equal(j.refused.n, 0)
  assert.equal(j.climbFails.n, 0)
})

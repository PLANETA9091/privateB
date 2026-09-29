// Tests for the wet-column doom memo (v0.319.0).
//
// MEASURED (fleet 36606754498, the v0.316.0 doom-latch face): 7 wet-wall
// yields and the seam is real - F15 condemned y=57 ('no dry bearing owns
// this column') and the final-bank ladder's very next climb re-probed the
// SAME column from the same shaft bottom, ground 4 MORE wet rotations and
// yielded again ('F15 climb wet-wall yield: 4 wet rotations vs 0 dry at
// y=57' twice, then 'no retry (no retry for wet wall)'). F18 y=45 the same
// shape twice. The yield's verdict died with the climb that wrote it.
// THE CURE: a per-bot memo records the condemned column at the yield point;
// climbOut checks it at entry and refuses FAST with the SAME 'wet wall'
// reason every retry gate already handles - zero rotations, zero grind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  WET_COLUMN_MEMO_CAP, WET_COLUMN_MEMO_TOLERANCE,
  wetColumnMemoCondemn, wetColumnMemoBlocked
} from '../../src/lib/surface.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const surfaceSrc = readFileSync(new URL('../../src/lib/surface.mjs', import.meta.url), 'utf8')

const F15 = { x: -118, z: 393, y: 57 } // the fleet datum's shape: the condemned shaft-bottom column

test('wetColumnMemoCondemn: the fleet datum - the yield records the column and the counts', () => {
  const memo = new Map()
  const out = wetColumnMemoCondemn(memo, { ...F15, wetRotations: 4, dryRotations: 0 })
  assert.equal(out, memo, 'the same Map comes back (the call site chains)')
  const rec = memo.get(`${F15.x},${F15.z}`)
  assert.deepEqual(rec, { y: 57, wet: 4, dry: 0 }, 'the record echoes the yield level and the rotation counts')
})

test('wetColumnMemoBlocked: the F15 seam - a climb starting in the condemned column refuses', () => {
  const memo = new Map()
  wetColumnMemoCondemn(memo, { ...F15, wetRotations: 4, dryRotations: 0 })
  const v = wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 57 })
  assert.equal(v.blocked, true, 'the same column at the same level blocks')
  assert.deepEqual(v.record, { y: 57, wet: 4, dry: 0 }, 'the refusal names the recorded verdict')
})

test('wetColumnMemoBlocked: a climb starting BELOW the water must pass through - blocked', () => {
  const memo = new Map()
  wetColumnMemoCondemn(memo, { ...F15, wetRotations: 4, dryRotations: 0 })
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 50 }).blocked, true, 'y=50 climbs through y=57')
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 0 }).blocked, true, 'bedrock level climbs through too')
})

test('wetColumnMemoBlocked: a bot standing ABOVE the water climbs free (the tolerance gate)', () => {
  const memo = new Map()
  wetColumnMemoCondemn(memo, { ...F15, wetRotations: 4, dryRotations: 0 })
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 58 }).blocked, true, 'memoY + tolerance is still blocked (the step-up edge)')
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 59 }).blocked, false, 'one above the tolerance climbs free')
})

test('wetColumnMemoBlocked: a different column is a different book entry', () => {
  const memo = new Map()
  wetColumnMemoCondemn(memo, { ...F15, wetRotations: 4, dryRotations: 0 })
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x + 1, z: F15.z, y: 57 }).blocked, false, 'the neighbor column never wore the verdict')
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z + 7, y: 57 }).blocked, false, 'nor the far one')
})

test('junk never condemns and never blocks (the body-guard law)', () => {
  assert.doesNotThrow(() => wetColumnMemoCondemn(null, { x: 1, z: 2, y: 3 }), 'a null book condemns nothing')
  assert.doesNotThrow(() => wetColumnMemoCondemn(undefined, { x: 1, z: 2, y: 3 }))
  assert.doesNotThrow(() => wetColumnMemoCondemn('junk', F15), 'a non-Map book is a no-op')
  const memo = new Map()
  wetColumnMemoCondemn(memo, null)
  wetColumnMemoCondemn(memo, { x: NaN, z: F15.z, y: 57 })
  wetColumnMemoCondemn(memo, { x: F15.x, z: undefined, y: 57 })
  wetColumnMemoCondemn(memo, { x: F15.x, z: F15.z, y: 'junk' })
  assert.equal(memo.size, 0, 'junk coordinates never land in the book')
  assert.deepEqual(wetColumnMemoBlocked(null, { x: 1, z: 2, y: 3 }), { blocked: false, record: null }, 'a null book blocks nothing')
  assert.deepEqual(wetColumnMemoBlocked(memo, null).blocked, false, 'junk coords never block')
  assert.deepEqual(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: NaN }).blocked, false, 'a junk start level never blocks')
  assert.deepEqual(wetColumnMemoBlocked('junk', { x: F15.x, z: F15.z, y: 57 }).blocked, false, 'a non-Map book blocks nothing')
})

test('junk inside a REAL record never blocks (the half-written-entry edge)', () => {
  const memo = new Map()
  memo.set(`${F15.x},${F15.z}`, null)
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 57 }).blocked, false, 'a null record reads as unknown')
  memo.set(`${F15.x},${F15.z}`, { y: NaN })
  assert.equal(wetColumnMemoBlocked(memo, { x: F15.x, z: F15.z, y: 57 }).blocked, false, 'a junk level reads as unknown')
})

test('the cap bounds the book and evicts the oldest column first', () => {
  const memo = new Map()
  for (let i = 0; i < WET_COLUMN_MEMO_CAP + 4; i++) {
    wetColumnMemoCondemn(memo, { x: i, z: 1000, y: 50 + i, wetRotations: 4, dryRotations: 0 })
  }
  assert.equal(memo.size, WET_COLUMN_MEMO_CAP, `the book holds the cap (${WET_COLUMN_MEMO_CAP})`)
  assert.equal(memo.has('0,1000'), false, 'the oldest column evicted first (insertion order is the queue)')
  assert.equal(memo.has(`${WET_COLUMN_MEMO_CAP + 3},1000`), true, 'the newest column still rides')
  const recondemn = new Map()
  wetColumnMemoCondemn(recondemn, { x: 5, z: 1000, y: 55 })
  wetColumnMemoCondemn(recondemn, { x: 5, z: 1000, y: 57 }, )
  assert.equal(recondemn.size, 1, 're-condemning a known column updates it, never evicts it')
  assert.equal(recondemn.get('5,1000').y, 57, 'the freshest verdict wins')
})

test('constants pin: the cap is generous, the tolerance one step', () => {
  assert.equal(WET_COLUMN_MEMO_CAP, 32, '32 columns is ~5x the six unique ones fleet 36606754498 produced')
  assert.equal(WET_COLUMN_MEMO_TOLERANCE, 1, 'one step-up level of tolerance, no more')
})

test('wiring: the miner imports the memo pair and the lazy book init sits at the yield', () => {
  assert.ok(minerSrc.includes('wetColumnMemoCondemn, wetColumnMemoBlocked'), 'the import names both halves')
  assert.ok(/if \(!bot\._wetColumnMemo\) bot\._wetColumnMemo = new Map\(\)/.test(minerSrc), 'the book is created lazily at the yield point')
  assert.ok(minerSrc.includes('wetColumnMemoCondemn(bot._wetColumnMemo,'), 'the yield point condemns the column')
  assert.ok(minerSrc.includes('wetColumnMemoBlocked(bot._wetColumnMemo,'), 'climbOut reads the memo at entry')
})

test('wiring: the memo check sits after the ledger gate and BEFORE the bearing selection', () => {
  const entry = minerSrc.indexOf('const entry = climbEntry(bot._climbLedger,')
  const memo = minerSrc.indexOf('const memoVerdict = wetColumnMemoBlocked(bot._wetColumnMemo,')
  const bearing = minerSrc.indexOf('const raw = dir && (dir.x || dir.z) ? dir : new Vec3(1, 0, 0)')
  assert.ok(entry > -1 && memo > entry, 'the ledger escalates first (a healthy column keeps its stage ladder)')
  assert.ok(bearing > memo, 'the bearing is only chosen when the memo said climb')
})

test('wiring: the refusal borrows the wet-wall shape the retry gates already own', () => {
  assert.ok(minerSrc.includes("reason: 'wet wall', gained: 0, dug: 0, steps: 0, traversed: 0, memoRefusal: true"), "the return rides reason 'wet wall' (fleet19's 'no retry for wet wall' composes untouched)")
  const memoLine = (minerSrc.match(/climb wet memo:[^`]*/g) || [''])[0]
  assert.ok(memoLine.length > 0, 'the refusal log names the column and the recorded verdict')
  assert.ok(!memoLine.includes('no dry bearing owns this column'), 'the memo line speaks its own words - the yield line owns that sentence')
})

test('wiring: the yield line form is byte-stable (the v0.312.0 pin still holds)', () => {
  assert.ok(minerSrc.includes('climb wet-wall yield: ${wetRotLevel} wet rotations vs ${dryRotLevel} dry at y=${feet.y} - no dry bearing owns this column, the fence reserve returns to the chain'), 'the condemn is silent; the yield line keeps its exact words')
})

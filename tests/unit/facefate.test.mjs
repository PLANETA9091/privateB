// The face fate pins (v0.546.0) - the frozen book's READER side.
//
// THE SEAM: decompose read every face the same way whether the artifact
// carried the FLEET RESULT block or was cut off mid-run - the v0.358.0
// lesson ('a FATAL face never prints the FLEET RESULT, the mid-run lines
// are ALL the account') lived as a COMMENT, never as a printed row: a
// truncated artifact read exactly like a complete one until the human
// scrolled the raw log.
//
// THE WIRE: faceFate(lines) - the pure reader in src/lib - names the face's
// own ending BEFORE the censuses speak: result (the complete account),
// partial (the kill's own evidence line without the report block), none
// (the frozen book). THE LAW: result outranks partial - the hard kill
// prints the partial line AND THEN the full report, both present means the
// report landed; a junk or empty read is an honest 'none' with the why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { faceFate } from '../../src/lib/facefate.mjs'

const decomposeSrc = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')

test('THE LAW: result outranks partial - the hard kill prints both, the report landed', () => {
  const lines = [
    '[fleet] HARD KILL: 600s run + end-phase margin exceeded (end-phase hang) - exiting with partial evidence',
    '[fleet] partial: alive=19 mined=1204 banked=954 smelted=300 climbs=8',
    '================ FLEET RESULT (hard kill - deadline + margin exceeded (end-phase hang)) ================',
    'bots=19 spawned=20 reconnects=1 banked=954'
  ]
  const ff = faceFate(lines)
  assert.equal(ff.fate, 'result')
  assert.equal(ff.reason, 'hard kill - deadline + margin exceeded (end-phase hang)')
})

test('THE WIRE: partial - the report block absent, the kill evidence line landed', () => {
  const partialOnly = faceFate([
    'F1 alive=19 mined=1204 banked=954',
    '[fleet] partial: alive=19 mined=1204 banked=954 smelted=300',
    '[fleet] hard-kill report failed: the heap died mid-print - exiting with the partial line above'
  ])
  assert.equal(partialOnly.fate, 'partial')
  assert.match(partialOnly.line, /\[fleet\] partial: alive=/)
})

test('THE WIRE: none - the frozen book (mid-run lines alone) and the empty read, each with the honest why', () => {
  const frozen = faceFate([
    't-540s alive=19/19 mined=310 map=44p/3ch banked=0 smelted=0',
    'F3 retry #2 in 3.4s (ECONNRESET)',
    'hb t+120s live'
  ])
  assert.equal(frozen.fate, 'none')
  assert.match(frozen.why, /frozen book/)
  const empty = faceFate([])
  assert.equal(empty.fate, 'none')
  assert.match(empty.why, /empty read/)
})

test('JUNK-SAFE: no lines array - the honest none, no throw, no invented fate', () => {
  assert.deepEqual(faceFate(null), { fate: 'none', why: 'junk input - no lines array read' })
  assert.deepEqual(faceFate('a raw log string'), { fate: 'none', why: 'junk input - no lines array read' })
  assert.equal(faceFate([42, { x: 1 }, null, undefined]).fate, 'none', 'non-string lines are skipped, never parsed')
})

test('SOURCE PIN: decompose prints the FACE FATE row FIRST - imported, above the DEATHS block', () => {
  assert.match(decomposeSrc, /import \{ faceFate \} from '\.\.\/\.\.\/src\/lib\/facefate\.mjs'/)
  const fateAt = decomposeSrc.indexOf("console.log('=== FACE FATE ===')")
  const deathsAt = decomposeSrc.indexOf("console.log('=== DEATHS ===')")
  assert.ok(fateAt > -1, 'the FACE FATE header exists')
  assert.ok(deathsAt > -1, 'the DEATHS header exists')
  assert.ok(fateAt < deathsAt, 'the fate row speaks BEFORE the censuses')
  assert.match(decomposeSrc, /fate: NO FINAL REPORT/)
})

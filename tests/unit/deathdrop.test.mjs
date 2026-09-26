// (v0.199.0) THE DEATH-DROP LINE - run84 (fleet 36207216784) measured
// unaccounted=1479 (conversion 51.1% vs run195's 104.1%) with the fleet pocket
// falling 2453u -> 1509u exactly across the 6-death window: a death scatters
// the pocket, the death-spot memory steers the fleet away from the corpse, the
// stack despawns unattributed. deathDropLine names the loss at the death event.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deathDropLine } from '../../src/lib/statcarry.mjs'

test('the loss shape pins the position and the top-5 names', () => {
  const line = deathDropLine({
    tag: '[F3]',
    pos: { x: -65.6, y: 59.0, z: 399.7 },
    items: [
      { name: 'dirt', count: 120 },
      { name: 'stone', count: 88 },
      { name: 'raw_copper', count: 64 },
      { name: 'oak_log', count: 30 },
      { name: 'coal', count: 10 }
    ]
  })
  assert.equal(line, '[F3] death drop: ~312u lost at [-66,59,399] (dirt 120, stone 88, raw_copper 64, oak_log 30, coal 10)')
})

test('more than 5 names ride the +N more tail, count desc then name asc', () => {
  const line = deathDropLine({
    tag: '[F2]',
    pos: { x: -109, y: 68, z: 425 },
    items: [
      { name: 'cobblestone', count: 5 },
      { name: 'apple', count: 3 },
      { name: 'dirt', count: 50 },
      { name: 'diorite', count: 12 },
      { name: 'andesite', count: 12 },
      { name: 'granite', count: 7 }
    ]
  })
  assert.equal(line, '[F2] death drop: ~89u lost at [-109,68,425] (dirt 50, andesite 12, diorite 12, granite 7, cobblestone 5, +1 more)')
})

test('the honest empty read prints - silence is never evidence', () => {
  const line = deathDropLine({ tag: '[F9]', pos: { x: 1, y: 2, z: 3 }, items: [] })
  assert.equal(line, '[F9] death drop: pocket read empty at death (0u)')
})

test('junk position drops the at-segment, the line survives (legacy-safe)', () => {
  const line = deathDropLine({ tag: '[F7]', pos: { x: NaN, y: 2, z: 3 }, items: [{ name: 'dirt', count: 4 }] })
  assert.equal(line, '[F7] death drop: ~4u lost (dirt 4)')
  assert.equal(deathDropLine({ tag: '[F7]', pos: null, items: [{ name: 'dirt', count: 4 }] }),
    '[F7] death drop: ~4u lost (dirt 4)')
})

test('junk-safe: a non-array items read is null, junk entries filtered, fractions floor', () => {
  // the unreadable pocket renders null - the caller prints nothing
  assert.equal(deathDropLine({ tag: '[F1]', pos: null, items: null }), null)
  assert.equal(deathDropLine({ tag: '[F1]', pos: null, items: 'junk' }), null)
  assert.equal(deathDropLine({ tag: '[F1]', pos: null, items: undefined }), null)
  // junk entries never render as NaN, never throw
  const line = deathDropLine({
    tag: '[F1]',
    pos: null,
    items: [{ name: 'dirt', count: 3.9 }, { name: null, count: 5 }, { count: 7 }, { name: 'stone', count: -2 }, { name: 'sand', count: 'many' }, 'junk', null]
  })
  assert.equal(line, '[F1] death drop: ~3u lost (dirt 3)')
})

test('REGRESSION PIN: the miner death handler wires the drop snapshot', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/deathDropLine\(\{ tag, pos: bot\.entity\?\.position, items: bot\.inventory\?\.items\?\.\(\) \?\? null \}\)/.test(minerSrc),
    'the death handler reads the inventory AT the death event with the guarded call shape')
  assert.ok(/if \(drop\) log\(drop\)/.test(minerSrc), 'a null read prints nothing, a line prints')
  // the snapshot sits BEFORE the death-spot block: the read must happen while
  // the inventory still lists, and the respawn path stays guarded by try/catch
  const dropIdx = minerSrc.indexOf('deathDropLine({ tag, pos:')
  const spotIdx = minerSrc.indexOf('death spot memorized as a hazard')
  assert.ok(dropIdx > 0 && spotIdx > dropIdx, 'the drop snapshot precedes the death-spot memory block')
})

test("REGRESSION PIN: the fleet filter carries the 'death drop' key", async () => {
  const fs = await import('node:fs')
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(/combat\|died\|death drop\|/.test(fleetSrc),
    "the filter regex carries 'death drop' - the v0.56.0 filter-blind lesson never repeats")
})

// (v0.354.0) THE BLIND OLD-SPACE CURE - the mem line's old= has printed
// -1M on every row of every face since v0.55.0: the reader asked for the
// keys `name`/`size_used`, the documented schema is
// `space_name`/`space_used_size`, the find never matched. The GC Pinned
// hunt's key pool (old_space = retained JS objects) comes back into view.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { heapSpaceUsedMb } from '../../src/lib/heapspace.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('the documented schema reads correctly (the Node 22/24 shape, verified)', () => {
  const hs = [{ space_name: 'read_only_space', space_used_size: 0 }, { space_name: 'old_space', space_used_size: 157286400, space_size: 209715200 }, { space_name: 'new_space', space_used_size: 8388608 }]
  assert.equal(heapSpaceUsedMb(hs, 'old_space'), 150, '157286400 bytes = 150 MB')
  assert.equal(heapSpaceUsedMb(hs, 'new_space'), 8, 'the young pool reads too')
  assert.equal(heapSpaceUsedMb(hs, 'code_space'), -1, 'an absent space is the sentinel, never a guess')
})

test('the legacy schema reads as a fallback (a future rename degrades, never lies)', () => {
  const hs = [{ name: 'old_space', size_used: 104857600 }]
  assert.equal(heapSpaceUsedMb(hs, 'old_space'), 100)
})

test('a zero reading is a REAL zero, never the sentinel (the ?? law)', () => {
  assert.equal(heapSpaceUsedMb([{ space_name: 'old_space', space_used_size: 0 }], 'old_space'), 0, '0 used MB is a truth, not missing data')
})

test('the junk battery: no shape invents data (the body-guard law)', () => {
  assert.equal(heapSpaceUsedMb(null, 'old_space'), -1, 'a null array is the sentinel')
  assert.equal(heapSpaceUsedMb(undefined, 'old_space'), -1)
  assert.equal(heapSpaceUsedMb('junk', 'old_space'), -1, 'a non-array is the sentinel')
  assert.equal(heapSpaceUsedMb([], 'old_space'), -1, 'an empty array is the sentinel')
  assert.equal(heapSpaceUsedMb([{ space_name: 'old_space', space_used_size: 1 }], null), -1, 'a junk name is the sentinel')
  assert.equal(heapSpaceUsedMb([{ space_name: 'old_space', space_used_size: 1 }], ''), -1, 'an empty name is the sentinel')
  assert.equal(heapSpaceUsedMb([null, 'junk', 42], 'old_space'), -1, 'junk elements are skipped, never matched')
  assert.equal(heapSpaceUsedMb([{ space_name: 'old_space', space_used_size: 'junk' }], 'old_space'), -1, 'a non-finite used reading is the sentinel (the Number(null) lesson)')
  assert.equal(heapSpaceUsedMb(), -1, 'a bare call is the sentinel')
})

test('the wiring: the mem line rides the cure, the broken reader is gone', () => {
  assert.match(fleetSrc, /const sp = nm => heapSpaceUsedMb\(hs, nm\)/, 'the sp helper delegates to the tolerant reader')
  assert.match(fleetSrc, /heapSpaceUsedMb[^]*?from '\.\.\/src\/lib\/heapspace\.mjs'/, 'the import rides the fleet line')
  assert.ok(!/x\.name === nm/.test(fleetSrc), 'the broken reader (x.name === nm) is DEAD - it never matched the documented schema')
  assert.ok(!/s\.size_used \/ 1048576/.test(fleetSrc), 'the broken value key (size_used) is DEAD - the documented key is space_used_size')
  // the mem line keeps its format (the line format stability law)
  assert.match(fleetSrc, /old=\$\{sp\('old_space'\)\}M/, "the mem line still names the old_space pool")
})

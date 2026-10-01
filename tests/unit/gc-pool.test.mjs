// (v0.421.0) THE GC POOL LENS - unit pins. The fleet's mem gauge line has
// carried the old/ext/ab pool split since the v0.354.0 blind-old-space
// cure (heapspace.mjs's law: 'the old/ext/ab split says WHICH pool'); the
// verbatims below are the fleet's own words (faces 26/27 shapes). The
// lens owns the POOL read - the ceilings are the mem-hb lens's, the
// freeze clock the storm census's (the split-of-labor law).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGcPoolLine, gcPoolCensus } from '../../src/lib/gcpool.mjs'

test('gc-pool: the face-26 verbatim parses all pools', () => {
  const line = '   mem: heap=107M/141M old=87M ext=129M ab=127M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0'
  assert.deepEqual(parseGcPoolLine(line), {
    heapUsed: 107, heapLimit: 141, old: 87, ext: 129, ab: 127, rss: 374
  })
})

test('gc-pool: the face-27 verbatim parses all pools', () => {
  const line = '   mem: heap=110M/137M old=86M ext=129M ab=126M rss=366M cols=2053 ents=1831 evicted=193 path=6a/6q (max 6) stale=0'
  assert.deepEqual(parseGcPoolLine(line), {
    heapUsed: 110, heapLimit: 137, old: 86, ext: 129, ab: 126, rss: 366
  })
})

test('gc-pool: the -1 sentinel is the honest unknown, never a reading', () => {
  // the v0.354.0 era shape: old=-1M on every row while ext/ab still read
  const line = '   mem: heap=109M/141M old=-1M ext=129M ab=127M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0'
  const p = parseGcPoolLine(line)
  assert.equal(p.old, null)
  assert.equal(p.ext, 129)
  assert.equal(p.ab, 127)
  const c = gcPoolCensus([line])
  assert.equal(c.reads, 1)
  assert.equal(c.unknowns, 1) // old counted; the pools that read still price
  assert.deepEqual(c.pools.ext, { max: 129, last: 129 })
  assert.deepEqual(c.pools.old, { max: null, last: null })
})

test('gc-pool: the fully-blind row (heap fields at the sentinel) skips the headroom honestly', () => {
  const line = '   mem: heap=-1M/-1M old=-1M ext=129M ab=127M rss=374M cols=0 ents=0 evicted=0 path=0a/0q (max 6) stale=0'
  const c = gcPoolCensus([line])
  assert.equal(c.reads, 1)
  assert.equal(c.unknowns, 1) // only the POOL sentinel counts (old)
  assert.equal(c.headroomMin, null)
  assert.equal(c.pinnedShareMax, 68) // ext/ab still ride rss: 256/374 = 68%
})

test('gc-pool: the junk battery judges nothing', () => {
  for (const junk of [null, undefined, 42, '', '   mem: heap=x/141M old=87M', 'b] n=1 ts=21s rss=253M late=5ms mainLate=0ms', '   mem: heap=107M/141M old=87M ext=129M ab=127M rss=374M cols=1 ents=1 evicted=1 path=1a/1q (max 1)', '[stormguard] STORM PROBE: rss 379M -> 1213M']) {
    assert.equal(parseGcPoolLine(junk), null)
  }
  const c = gcPoolCensus(['junk', null])
  assert.equal(c.reads, 0)
  assert.equal(c.unknowns, 0)
  assert.equal(c.pinnedShareMax, 0)
  assert.equal(c.headroomMin, null)
})

test('gc-pool: the census prices pools, climbs, share and headroom (hand-counted)', () => {
  const c = gcPoolCensus([
    'launching 19 bots for 600s -> targets sand, gravel, dirt, stone',
    '   mem: heap=107M/141M old=87M ext=129M ab=127M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0',
    'b] n=4 ts=81s rss=377M late=19ms mainLate=734ms',
    '   mem: heap=102M/141M old=87M ext=128M ab=126M rss=377M cols=2032 ents=2240 evicted=357 path=6a/0q (max 6) stale=0',
    '   mem: heap=110M/143M old=88M ext=131M ab=129M rss=380M cols=2009 ents=2149 evicted=430 path=6a/6q (max 6) stale=0'
  ])
  assert.equal(c.reads, 3)
  assert.equal(c.unknowns, 0)
  assert.deepEqual(c.pools.old, { max: 88, last: 88 })
  assert.deepEqual(c.pools.ext, { max: 131, last: 131 })
  assert.deepEqual(c.pools.ab, { max: 129, last: 129 })
  // steps: old 87->87 (0), 87->88 (1); ext 129->128 (-1), 128->131 (3); ab 127->126 (-1), 126->129 (3)
  assert.deepEqual(c.jump, { old: 1, ext: 3, ab: 3 })
  // shares: 256/374=68, 254/377=67, 260/380=68 -> max 68
  assert.equal(c.pinnedShareMax, 68)
  // headroom: 141-107=34, 141-102=39, 143-110=33 -> min 33
  assert.equal(c.headroomMin, 33)
})

test('gc-pool: a single read has no climbs - the calm zero stays honest', () => {
  const c = gcPoolCensus(['   mem: heap=107M/141M old=87M ext=129M ab=127M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0'])
  assert.deepEqual(c.jump, { old: 0, ext: 0, ab: 0 })
  assert.deepEqual(c.pools.old, { max: 87, last: 87 })
  assert.equal(c.headroomMin, 34)
  assert.equal(c.pinnedShareMax, 68)
})

test('gc-pool: a zero-rss gauge skips the share without lying', () => {
  const line = '   mem: heap=0M/0M old=0M ext=0M ab=0M rss=0M cols=0 ents=0 evicted=0 path=0a/0q (max 6) stale=0'
  const c = gcPoolCensus([line])
  assert.equal(c.reads, 1)
  assert.equal(c.pinnedShareMax, 0) // the division never ran - an honest zero, not 100
  assert.equal(c.headroomMin, 0) // 0-0=0 is a REAL zero (the pools read)
})

test('gc-pool: negative steps never climb - a recede is not a jump', () => {
  const c = gcPoolCensus([
    '   mem: heap=107M/141M old=90M ext=135M ab=133M rss=380M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0',
    '   mem: heap=102M/141M old=87M ext=128M ab=126M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0'
  ])
  assert.deepEqual(c.jump, { old: 0, ext: 0, ab: 0 })
  assert.deepEqual(c.pools.old, { max: 90, last: 87 })
})

test('gc-pool: a raw text blob splits on newlines (the decompose shape)', () => {
  const blob = 'launch\n   mem: heap=107M/141M old=87M ext=129M ab=127M rss=374M cols=2071 ents=2076 evicted=255 path=6a/7q (max 6) stale=0\nend'
  assert.equal(gcPoolCensus(blob).reads, 1)
})

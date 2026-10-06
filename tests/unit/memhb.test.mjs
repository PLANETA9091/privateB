// (v0.408.0) THE MEM-HB LENS - unit pins. The fleet's own mem gauge line
// (testbed/fleet19.mjs's emitted form, ~60 reads per face) carries the OOM
// precursors as fields; FACE 25 attempt 1 (36857777922) died the run53 OOM
// class at launch and the trigger was priced BY HAND (the 1938 fire: path
// 6a/10q, evictions 216 -> 788 in ~2 min). The lens makes that read
// mechanical - the verbatims below are the fleet's own words.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseMemLine, parseStormCooldown, memHbCensus, MEM_HB_RE, STORM_COOLDOWN_RE, OOM_LOCK_RE, FREEZE_STORM_RE, RSS_JUMP_STORM_M } from '../../src/lib/memhb.mjs'

test('mem-hb: the boot read parses - the zero-fields face of the same shape', () => {
  const line = '   mem: heap=133M/162M old=103M ext=151M ab=148M rss=429M cols=0 ents=0 evicted=0 path=4a/0q (max 6) stale=0'
  const p = parseMemLine(line)
  assert.equal(p.heapUsed, 133)
  assert.equal(p.heapLimit, 162)
  assert.equal(p.rss, 429)
  assert.equal(p.cols, 0)
  assert.equal(p.ents, 0)
  assert.equal(p.evicted, 0)
  assert.equal(p.pathActive, 4)
  assert.equal(p.pathQueue, 0)
  assert.equal(p.pathMax, 6)
  assert.equal(p.stale, 0)
})

test('mem-hb: the mid-run verbatim parses all fields (the face-24 read)', () => {
  const line = '   mem: heap=103M/143M old=87M ext=129M ab=127M rss=380M cols=2081 ents=2049 evicted=237 path=6a/9q (max 6) stale=0'
  const p = parseMemLine(line)
  assert.deepEqual(p, {
    heapUsed: 103, heapLimit: 143, old: 87, ext: 129, ab: 127,
    rss: 380, cols: 2081, ents: 2049, evicted: 237,
    pathActive: 6, pathQueue: 9, pathMax: 6, stale: 0
  })
})

test('mem-hb: the census prices the precursors - ceilings, eviction velocity, path peaks', () => {
  const c = memHbCensus([
    'launching 19 bots for 600s',
    '   mem: heap=133M/162M old=103M ext=151M ab=148M rss=429M cols=0 ents=0 evicted=0 path=4a/0q (max 6) stale=0',
    'F2 [F2] combat: fighting skeleton',
    '   mem: heap=103M/143M old=87M ext=129M ab=127M rss=380M cols=2081 ents=2049 evicted=237 path=6a/9q (max 6) stale=0',
    '   mem: heap=110M/142M old=88M ext=131M ab=129M rss=371M cols=2100 ents=2197 evicted=339 path=6a/12q (max 6) stale=19',
    '   mem: heap=118M/143M old=89M ext=128M ab=126M rss=380M cols=2033 ents=2044 evicted=450 path=6a/4q (max 6) stale=25'
  ])
  assert.equal(c.reads, 4)
  assert.equal(c.rssMax, 429) // the boot spike outlives the steady state
  assert.equal(c.heapUsedMax, 133)
  assert.equal(c.heapLimitLast, 143) // the LAST read's limit, not the max
  assert.equal(c.colsMax, 2100)
  assert.equal(c.entsMax, 2197)
  assert.equal(c.staleMax, 25)
  assert.deepEqual(c.evicted, { max: 450, first: 0, last: 450, peakJump: 237, resets: 0 }) // jumps: 0->237 (237), 237->339 (102), 339->450 (111)
  assert.deepEqual(c.path, { peakActive: 6, peakQueue: 12, pathMax: 6 })
  assert.equal(c.stormCooldowns, 0)
  assert.equal(c.oomLocks, 0)
})

test('mem-hb: the partial-sum semantics - a guard reset is counted, never a negative climb', () => {
  // the fleet's evicted is the SUM over LIVE guards (recreated at
  // respawn/relog) - the drop is a guard replacement, the honest reads
  // are max (the deepest debt), peakJump (the sharpest climb), resets
  const c = memHbCensus([
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=370M cols=1900 ents=1900 evicted=500 path=6a/9q (max 6) stale=0',
    '   mem: heap=101M/143M old=80M ext=120M ab=110M rss=370M cols=1900 ents=1900 evicted=480 path=6a/9q (max 6) stale=0',
    '   mem: heap=102M/143M old=80M ext=120M ab=110M rss=370M cols=1900 ents=1900 evicted=510 path=6a/9q (max 6) stale=0'
  ])
  assert.equal(c.evicted.max, 510)
  assert.equal(c.evicted.first, 500)
  assert.equal(c.evicted.last, 510)
  assert.equal(c.evicted.peakJump, 30) // the 480 -> 510 leg; the -20 is not a climb
  assert.equal(c.evicted.resets, 1)
})

test('mem-hb: the storm cooldown parses - the craft storm refusal, per-bot', () => {
  const p = parseStormCooldown('F12 [F12] craft wooden_pickaxe: storm cooldown 45000ms left (3 consecutive timeouts) - refusing')
  assert.deepEqual(p, { bot: 'F12', item: 'wooden_pickaxe', waitMs: 45000, consecutive: 3, skin: 'tagged' })
  const c = memHbCensus([
    'F12 [F12] craft wooden_pickaxe: storm cooldown 45000ms left (3 consecutive timeouts) - refusing',
    'F8 [F8] craft stone_shovel: storm cooldown 30000ms left (2 consecutive timeouts) - refusing',
    'F12 [F12] craft wooden_pickaxe: storm cooldown 60000ms left (4 consecutive timeouts) - refusing'
  ])
  assert.equal(c.stormCooldowns, 3)
  assert.deepEqual(c.stormByBot.F12, { count: 2, maxConsecutive: 4 })
  assert.deepEqual(c.stormByBot.F8, { count: 1, maxConsecutive: 2 })
})

test('mem-hb: the two euthanasia forms count as oom locks', () => {
  const locked = '[stormguard] the MAIN thread is locked while allocating (run53/35647216505 OOM class; mainLate read 2731ms but the pulse has been frozen 55s - the reading was stale) - every closure applier lives on the locked main; emergency SIGTERM keeps the story readable (exit 143)'
  const toDeath = '[stormguard] the MAIN thread is allocating itself to death while frozen (run53/35647216505 OOM class: unsymbolized exit 134, mainLate was 2731ms) - emergency SIGTERM keeps the story readable (exit 143)'
  const c = memHbCensus([locked, toDeath])
  assert.equal(c.oomLocks, 2)
  assert.ok(OOM_LOCK_RE.test(locked))
  assert.ok(OOM_LOCK_RE.test(toDeath))
  // a prose carrier is not an event (the substring-pollution lesson)
  assert.ok(!OOM_LOCK_RE.test('the stormguard watched the MAIN thread is locked while allocating story unfold'))
})

test('mem-hb: the junk battery - truncated gauges, prose, strangers, non-strings', () => {
  const junk = [
    '   mem: heap=103M/143M old=87M ext=129M ab=127M rss=380M cols=2081', // truncated
    '   mem: heap=103M/143M old=87M ext=129M ab=127M rss=380M cols=2081 ents=2049 evicted=237 path=6a/9q (max 6)', // missing stale
    'mem: heap=103M/143M old=87M ext=129M ab=127M rss=380M cols=2081 ents=2049 evicted=237 path=6a/9q (max 6) stale=0 extra', // suffix
    'F12 [F12] storm cooldown (3 consecutive timeouts)', // the 1938 hand quote - NOT the emitter shape (no craft item)
    'F12 [F12] craft wooden_pickaxe: storm cooldown soon', // not the emitter's numbers
    'F12 [F12] craft wooden_pickaxe: storm cooldown 45000ms left (3 consecutive timeouts) - refusing', // valid shape, NO bot tag match -> still parses; the census anchor is the emitter itself
    null,
    42,
    'a death is a cost the deficit cannot repay'
  ]
  // the gauge parser judges NOTHING on all junk (the mem line's shape is exact)
  for (const l of junk.slice(0, 6)) assert.equal(parseMemLine(l), null)
  for (const l of [null, 42]) {
    assert.equal(parseMemLine(l), null)
    assert.equal(parseStormCooldown(l), null)
  }
  // the storm parser rejects the hand-quote and the numberless shape
  assert.equal(parseStormCooldown(junk[3]), null)
  assert.equal(parseStormCooldown(junk[4]), null)
  // the census over the junk battery: only the valid verbatim rides
  const c = memHbCensus(junk)
  assert.equal(c.reads, 0)
  assert.equal(c.stormCooldowns, 1)
  assert.deepEqual(c.stormByBot.F12, { count: 1, maxConsecutive: 3 })
  assert.equal(c.oomLocks, 0)
  assert.deepEqual(c.evicted, { max: null, first: null, last: null, peakJump: 0, resets: 0 })
})

test('mem-hb: the honest zero on a gaugeless face + the pinned anatomy', () => {
  const c = memHbCensus(['launching 19 bots for 600s', 'F2 [F2] combat: fighting skeleton'])
  assert.equal(c.reads, 0)
  assert.equal(c.rssMax, null)
  assert.deepEqual(c.evicted, { max: null, first: null, last: null, peakJump: 0, resets: 0 })
  assert.deepEqual(c.path, { peakActive: 0, peakQueue: 0, pathMax: null })
  // the anatomy pins: the regexes are the emitters' own words
  assert.match('   mem: heap=1M/2M old=1M ext=1M ab=1M rss=1M cols=1 ents=1 evicted=1 path=1a/1q (max 1) stale=1', MEM_HB_RE)
  assert.match('F1 [F1] craft dirt: storm cooldown 1ms left (1 consecutive timeouts) - refusing', STORM_COOLDOWN_RE)
})

test('mem-hb: the three skins, one emitter (v0.478.0) - the face-43 undercount fixed', () => {
  // The live five (run 36970605824, F13's storm): three caller skins, ONE
  // emitter. The old RE owned only the tagged skin - the census read 1 of 5.
  const live5 = [
    'F13 [toolupgrade] [upgrade] craft stone_pickaxe: storm cooldown 2166ms left (3 consecutive timeouts) - refusing',
    'F13 [toolupgrade] [upgrade] craft stone_shovel: storm cooldown 2166ms left (3 consecutive timeouts) - refusing',
    'F13 craft stone_pickaxe: storm cooldown 2158ms left (3 consecutive timeouts) - refusing',
    'F13 craft stone_sword: storm cooldown 2151ms left (3 consecutive timeouts) - refusing',
    'F13 [F13] craft oak_planks: storm cooldown 3986ms left (3 consecutive timeouts) - refusing'
  ]
  const c = memHbCensus(live5)
  assert.equal(c.stormCooldowns, 5) // was 1 before the three-skin fix
  assert.deepEqual(c.stormByBot.F13, { count: 5, maxConsecutive: 3 })
  // The skins name their callers; the fields ride every read.
  const tagged = parseStormCooldown(live5[4])
  assert.deepEqual(tagged, { bot: 'F13', item: 'oak_planks', waitMs: 3986, consecutive: 3, skin: 'tagged' })
  const upgrade = parseStormCooldown(live5[0])
  assert.deepEqual(upgrade, { bot: 'F13', item: 'stone_pickaxe', waitMs: 2166, consecutive: 3, skin: 'upgrade' })
  const plain = parseStormCooldown(live5[2])
  assert.deepEqual(plain, { bot: 'F13', item: 'stone_pickaxe', waitMs: 2158, consecutive: 3, skin: 'plain' })
  // The bot token is the line's FIRST token on every skin.
  assert.equal(tagged.bot, 'F13')
  assert.equal(upgrade.bot, 'F13')
  assert.equal(plain.bot, 'F13')
  // An unknown tag combo still parses (the tail anchors the emitter) and
  // names itself honestly.
  const other = parseStormCooldown('F2 [somelane] craft stick: storm cooldown 100ms left (3 consecutive timeouts) - refusing')
  assert.equal(other.skin, 'other')
  assert.equal(other.bot, 'F2')
})

// ---- (v0.677.0) THE RSS JUMP - the storm between the gauges ----
// The 20th flight (37409860732) read FLAT gauges (~382M across 8 samples)
// and died between them: the FATAL's own words carry the numbers the
// gauges never sampled. The verbatim below is the stub log's own line.
const FREEZE_FATAL = '[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 385M -> 1212M growing past the 1200M floor - the closure cannot land; run 36292057377 spent the probe at 2271M and the ceiling SIGTERM lost the race to the V8 OOM at exit 134; last: pf:done fuel commons wa @+0.0s <- climb @+0.0s <- pf:done next column alt @+-0.0s)'

test('mem-hb: the rss jump prices the sharpest climb, GC drops never fold in', () => {
  const c = memHbCensus([
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=380M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0',
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=375M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0', // GC drop
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=420M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0', // +45
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=470M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0' // +50 the max
  ])
  assert.equal(c.rssJump.max, 50)
  assert.equal(c.rssJump.storms, 0)
  assert.equal(c.rssMax, 470)
})

test('mem-hb: the storm threshold counts the >= 100M/gauge climbs', () => {
  const c = memHbCensus([
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=380M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0',
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=490M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0', // +110 storm
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=400M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0', // GC drop
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=530M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0' // +130 storm, the max
  ])
  assert.equal(c.rssJump.max, 130)
  assert.equal(c.rssJump.storms, 2)
})

test('mem-hb: the freeze-storm FATAL prices the gap between the gauges', () => {
  const c = memHbCensus([
    '   mem: heap=106M/149M old=89M ext=122M ab=120M rss=383M cols=1952 ents=2691 evicted=852 path=6a/0q (max 6) stale=0',
    FREEZE_FATAL,
    '[stormguard] the MAIN thread is locked while allocating (run53/35647216505 OOM class; mainLate read 927ms but the pulse has been frozen 5s - the reading was stale) - every closure applier lives on the locked main; emergency SIGTERM keeps the story readable (exit 143)'
  ])
  // the byte-exact 20th-flight read: the gauges never sampled the climb
  assert.equal(c.rssJump.max, 0)
  assert.equal(c.rssJump.storms, 0)
  assert.deepEqual(c.freezeStorm, { frozenS: 5, from: 385, to: 1212, floor: 1200 })
  assert.equal(c.oomLocks, 1) // the epilogue still counts as its own row
})

test('mem-hb: no FATAL, no freezeStorm - the honest null (junk-safe)', () => {
  const c = memHbCensus([
    '   mem: heap=100M/143M old=80M ext=120M ab=110M rss=380M cols=1900 ents=1900 evicted=0 path=0a/0q (max 6) stale=0',
    'the stormguard FATAL watched the freeze storm rss 385M -> 1212M story unfold', // a prose carrier, not the emitter shape
    null,
    42
  ])
  assert.equal(c.freezeStorm, null)
  assert.equal(c.oomLocks, 0)
  assert.ok(!FREEZE_STORM_RE.test('the stormguard FATAL watched the freeze storm rss 385M -> 1212M story unfold'))
})

test('mem-hb: the storm threshold is the named constant (the bound law)', () => {
  assert.equal(RSS_JUMP_STORM_M, 100)
})

test('WIRING: the decompose prints the rss jump row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /rss jump: max \+\$\{rj\.max\}M\/gauge/, "the storm between the gauges prints in the MEMORY block")
  assert.match(src, /the FATAL saw \+\$\{mem\.freezeStorm\.to - mem\.freezeStorm\.from\}M/, "the FATAL's own gap joins the row")
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideWeather } from '../../src/lib/decideweather.mjs'

// The 27th face's live shapes verbatim (run 37434944132, the v0.687.0
// tree's first face) - the hb anchor cycle, the mem gauge (the 3-space
// indent is the emitter's own skin, MEM_HB_RE's `^ *` reads it), the
// chest-walk decide refusal and the sweep histogram pair.
const mini27 = [
  'b] n=1 ts=21s rss=258M late=5ms mainLate=0ms',
  '   mem: heap=117M/147M old=96M ext=133M ab=130M rss=379M cols=2109 ents=2405 evicted=237 path=6a/5q (max 6) stale=0',
  'F4 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
  'F16 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
  'b] n=2 ts=200s rss=349M late=10ms mainLate=186ms',
  '   mem: heap=106M/146M old=88M ext=127M ab=125M rss=438M cols=2028 ents=2899 evicted=341 path=6a/9q (max 6) stale=0',
  'F17 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
  'F16 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x2',
  'b] n=3 ts=300s rss=355M late=9ms mainLate=0ms',
  '   mem: heap=100M/146M old=80M ext=120M ab=120M rss=300M cols=1000 ents=800 evicted=100 path=1a/0q (max 6) stale=0',
  // the non-decide family never joins (the decide-only scope law)
  'F10 iron commune: chest walk failed (No path to the goal!)',
  'F5 fuel commons: chest walk failed (fuel commons walk @-148,412: timeout after 2784ms)',
  // prose noise
  'F5 sweep: 0 collected (16 idle-empty machines)'
]

test('decideWeather reads the 27th shapes byte-exact: every starve joins the sky at or before its own anchor', () => {
  const r = decideWeather(mini27)
  // five decide attempts (3 chest-walks + a sweep pair's x2); the
  // no-path and walk-timeout refusals stay outside the decide family
  assert.equal(r.fails, 5)
  assert.equal(r.timed, 5)
  assert.equal(r.gauged, 5)
  assert.equal(r.ungauged, 0)
  // the joins: F4+F16 -> gauge ts=21 (2405/379M); F17 + the sweep x2 ->
  // gauge ts=200 (2899/438M); the ts=300 gauge is the FUTURE sky, never
  // joined (the sky at the starve, never a future sky)
  assert.deepEqual(r.ents, { min: 2405, median: 2899, max: 2899 })
  assert.deepEqual(r.rss, { min: 379, median: 438, max: 438 })
  // the face's own anchored ceiling
  assert.equal(r.faceEntsMax, 2899)
  assert.equal(r.faceRssMax, 438)
  // half the ceiling = 1449.5 - all five gauged starves sat at or past it
  assert.deepEqual(r.crowded, { n: 5, of: 5 })
})

test('the raw 27th log rides the same verdict: 15/15 starves under the crowded sky', async () => {
  // the maiden production read's own file shape (run 37434944132) -
  // downloaded fresh each CI pass, the lens re-prices the face it was
  // born on (the v0.683.0 self-read precedent)
  const { existsSync } = await import('node:fs')
  const p = '/tmp/face34944132/fleet19.log'
  if (!existsSync(p)) return // the artifact is fire-local; CI arbitrates the rest
  const r = decideWeather(readFileSync(p, 'utf8').split('\n'))
  assert.equal(r.fails, 15)
  assert.equal(r.timed, 15)
  assert.equal(r.gauged, 15)
  assert.deepEqual(r.ents, { min: 1824, median: 2420, max: 2899 })
  assert.deepEqual(r.rss, { min: 382, median: 384, max: 438 })
  assert.equal(r.faceEntsMax, 3187)
  assert.deepEqual(r.crowded, { n: 15, of: 15 })
})

test('a starve before the first gauge stays ungauged - the sky never invents itself', () => {
  const r = decideWeather([
    'b] n=1 ts=21s rss=258M late=5ms mainLate=0ms',
    'F4 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
  ])
  assert.equal(r.fails, 1)
  assert.equal(r.timed, 1)
  assert.equal(r.gauged, 0)
  assert.equal(r.ungauged, 1)
  assert.equal(r.ents, null)
  assert.equal(r.rss, null)
  assert.equal(r.crowded, null)
  // the anchored ceiling still prices from the gauges that exist... none here
  assert.equal(r.faceEntsMax, null)
})

test('the untimed starve (pre-first-hb) never joins and the unanchored gauge never prices the ceiling', () => {
  const r = decideWeather([
    '   mem: heap=117M/147M old=96M ext=133M ab=130M rss=379M cols=2109 ents=2405 evicted=237 path=6a/5q (max 6) stale=0',
    'F4 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'b] n=1 ts=21s rss=258M late=5ms mainLate=0ms',
    '   mem: heap=106M/146M old=88M ext=127M ab=125M rss=438M cols=2028 ents=2899 evicted=341 path=6a/9q (max 6) stale=0'
  ])
  // the pre-hb mem line is unanchored - it never joins, never prices the
  // ceiling; the fail (pre-first-hb) is untimed
  assert.equal(r.fails, 1)
  assert.equal(r.timed, 0)
  assert.equal(r.gauged, 0)
  assert.equal(r.faceEntsMax, 2899)
  assert.equal(r.faceRssMax, 438)
  assert.equal(r.crowded, null)
})

test('the calm-sky fork: starves below half the ceiling read the disease side', () => {
  const r = decideWeather([
    'b] n=1 ts=21s rss=258M late=5ms mainLate=0ms',
    '   mem: heap=100M/146M old=80M ext=120M ab=120M rss=300M cols=1000 ents=800 evicted=100 path=1a/0q (max 6) stale=0',
    'F17 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'b] n=2 ts=200s rss=349M late=10ms mainLate=186ms',
    '   mem: heap=106M/146M old=88M ext=127M ab=125M rss=438M cols=2028 ents=2899 evicted=341 path=6a/9q (max 6) stale=0'
  ])
  // ceiling 2899, half 1449.5; the starve rode the 800-ents gauge
  assert.deepEqual(r.crowded, { n: 0, of: 1 })
  assert.deepEqual(r.ents, { min: 800, median: 800, max: 800 })
})

test('the zero shape: a famine-free face never invents a starve (and junk reads the zero)', () => {
  for (const junk of [null, undefined, 42, 'a raw blob with no lines', { nope: true }, [1, null, { obj: 'row' }]]) {
    const r = decideWeather(junk)
    assert.equal(r.fails, 0)
    assert.equal(r.timed, 0)
    assert.equal(r.gauged, 0)
    assert.equal(r.ungauged, 0)
    assert.equal(r.ents, null)
    assert.equal(r.rss, null)
    assert.equal(r.crowded, null)
  }
  // a real string blob rides the same zero (no starvation in it)
  const r = decideWeather('b] n=1 ts=21s rss=258M late=5ms mainLate=0ms\n   mem: heap=100M/146M old=80M ext=120M ab=120M rss=300M cols=1000 ents=800 evicted=100 path=1a/0q (max 6) stale=0\nF5 sweep: 0 collected (16 idle-empty machines)')
  assert.equal(r.fails, 0)
  assert.equal(r.faceEntsMax, 800)
})

test('WIRING: decompose rides the decide weather beside the decide clock', () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("import { decideWeather } from '../../src/lib/decideweather.mjs'"), 'the import rides')
  assert.ok(src.includes('the decide weather: the A* starved at ents'), 'the print rides beside the decide clock')
})

// (v0.695.0) THE HOP LANE'S SKY - the hop-zero lane's own decide starves
// join the same sky under a separate count; the drained sky names the
// starves the entity climb cannot explain.

const mini30 = [
  'b] n=1 ts=421s rss=440M late=5ms mainLate=0ms',
  '   mem: heap=120M/173M old=100M ext=150M ab=148M rss=440M cols=2000 ents=2405 evicted=200 path=2a/0q (max 6) stale=0',
  'F14 [F14] hop: chest at [-109,71,401] d=34 zero: chest unreachable (Took to long to decide path to goal!)',
  'b] n=2 ts=481s rss=450M late=8ms mainLate=0ms',
  '   mem: heap=125M/173M old=105M ext=155M ab=152M rss=450M cols=2100 ents=2818 evicted=250 path=2a/0q (max 6) stale=0',
  'F18 [F18] hop: chest at [-109,71,401] d=29 zero: chest unreachable (Took to long to decide path to goal!)',
  // the drain: the face's own entity collapse, the rss held
  'b] n=3 ts=621s rss=453M late=6ms mainLate=0ms',
  '   mem: heap=130M/173M old=110M ext=160M ab=158M rss=453M cols=109 ents=116 evicted=0 path=1a/0q (max 6) stale=1',
  'b] n=4 ts=721s rss=457M late=7ms mainLate=0ms',
  '   mem: heap=133M/173M old=112M ext=163M ab=161M rss=457M cols=0 ents=0 evicted=0 path=1a/0q (max 6) stale=1',
  'F3 [F3] hop: chest at [-114,71,409] d=8 zero: chest unreachable (Took to long to decide path to goal!)',
  // the non-decide hop zeros never join (the decide-only scope law)
  'F7 [F7] hop: chest at [-149,71,411] d=33 zero: chest unreachable (No path to the goal!)',
  'F5 [F5] hop: chest at [-140,71,405] d=12 zero: chest unreachable (walk to chest: timeout after 15000ms)'
]

test('the hop lane joins the same sky under its own count (the 30th shapes byte-exact)', () => {
  const r = decideWeather(mini30)
  // the walk-fail family rides untouched (no walk-fail decide lines here)
  assert.equal(r.fails, 0)
  // the hop lane: 3 decide-timeout zeros; the no-path and walk-timeout
  // hop zeros stay outside (the decide-only scope)
  assert.equal(r.hop.zeros, 3)
  assert.equal(r.hop.gauged, 3)
  assert.equal(r.hop.ungauged, 0)
  // F14 -> ts=421 (ents 2405); F18 -> ts=481 (ents 2818); F3 -> ts=721
  // (ents 0, the drained gauge)
  assert.deepEqual(r.hop.ents, { min: 0, median: 2405, max: 2818 })
  assert.deepEqual(r.hop.rss, { min: 440, median: 450, max: 457 })
  // ceiling 2818, half 1409: F14 2405 in, F18 2818 in, F3's 0 out
  assert.deepEqual(r.hop.crowded, { n: 2, of: 3 })
  // the drained sky: F3's joined gauge read ents 0 AND cols 0
  assert.deepEqual(r.hop.drained, { n: 1, of: 3 })
  assert.deepEqual(r.hop.drainedRss, { min: 457, median: 457, max: 457 })
})

test('the drained signature is BOTH counters zero - an ents-0 gauge with cols loaded is not drained', () => {
  const r = decideWeather([
    'b] n=1 ts=100s rss=400M late=5ms mainLate=0ms',
    '   mem: heap=120M/173M old=100M ext=150M ab=148M rss=400M cols=900 ents=0 evicted=0 path=1a/0q (max 6) stale=1',
    'F3 [F3] hop: chest at [-114,71,409] zero: chest unreachable (Took to long to decide path to goal!)'
  ])
  assert.equal(r.hop.zeros, 1)
  assert.equal(r.hop.gauged, 1)
  // ents 0 joined, but cols 900 - the sky read empty of entities while
  // the world stayed loaded; the drained sky never names it
  assert.equal(r.hop.ents.min, 0)
  assert.equal(r.hop.drained, null)
  assert.equal(r.hop.drainedRss, null)
})

test("the raw 30th log rides the same verdict: the yard's 9 zeros, 5 under the drained sky", async () => {
  const { existsSync } = await import('node:fs')
  const p = '/tmp/face3047831347/fleet19.log'
  if (!existsSync(p)) return // the artifact is fire-local; CI arbitrates the rest
  const r = decideWeather(readFileSync(p, 'utf8').split('\n'))
  // the walk-fail family's own verdict rides unchanged (the v0.689.0 row)
  assert.equal(r.fails, 23)
  assert.deepEqual(r.crowded, { n: 21, of: 23 })
  // the hop lane's own read - the bank yard's zeros, bimodal
  assert.equal(r.hop.zeros, 9)
  assert.equal(r.hop.gauged, 9)
  assert.equal(r.hop.ungauged, 0)
  assert.deepEqual(r.hop.ents, { min: 0, median: 0, max: 2818 })
  assert.deepEqual(r.hop.rss, { min: 399, median: 455, max: 459 })
  assert.deepEqual(r.hop.crowded, { n: 4, of: 9 })
  assert.deepEqual(r.hop.drained, { n: 5, of: 9 })
  assert.deepEqual(r.hop.drainedRss, { min: 455, median: 457, max: 459 })
})

test('the hop field rides the junk battery and the honest zero', () => {
  for (const junk of [null, undefined, 42, { nope: true }, [1, null, { obj: 'row' }]]) {
    const r = decideWeather(junk)
    assert.equal(r.hop.zeros, 0)
    assert.equal(r.hop.gauged, 0)
    assert.equal(r.hop.ungauged, 0)
    assert.equal(r.hop.ents, null)
    assert.equal(r.hop.rss, null)
    assert.equal(r.hop.crowded, null)
    assert.equal(r.hop.drained, null)
    assert.equal(r.hop.drainedRss, null)
  }
  // a face with hop zeros but no anchored gauges: the UNTIMED zero (no
  // hb before it) never joins and never counts as ungauged - the
  // v0.689.0 law's own shape (fails the count, stays unplaced)
  const r = decideWeather([
    'F3 [F3] hop: chest at [-114,71,409] d=8 zero: chest unreachable (Took to long to decide path to goal!)'
  ])
  assert.equal(r.hop.zeros, 1)
  assert.equal(r.hop.ungauged, 0)
  assert.equal(r.hop.gauged, 0)
  assert.equal(r.hop.crowded, null)
  assert.equal(r.hop.drained, null)
  // the TIMED zero before the first gauge reads ungauged - the anchor
  // existed, the sky did not
  const r2 = decideWeather([
    'b] n=1 ts=100s rss=400M late=5ms mainLate=0ms',
    'F3 [F3] hop: chest at [-114,71,409] d=8 zero: chest unreachable (Took to long to decide path to goal!)'
  ])
  assert.equal(r2.hop.zeros, 1)
  assert.equal(r2.hop.ungauged, 1)
  assert.equal(r2.hop.gauged, 0)
  assert.equal(r2.hop.crowded, null)
})

test("WIRING: decompose rides the hop lane's sky beside the decide weather", () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("the hop lane's sky:"), 'the print rides beside the decide weather')
  assert.ok(src.includes('under the drained sky'), 'the drained clause rides')
})

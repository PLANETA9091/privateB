// THE SENSOR WINDOW'S OWN BOOK - the sensorwindow tests (v0.881.0).
//
// The blind reads' own windows: a maximal run of consecutive reset(-1)
// pass reads in one bot's line-order stream (the reuse law:
// parseSentryPass is the one parser, the blind skin is the o2 kind
// 'reset' - the parser's own word, never re-spelled). The run's read
// count is the price, the pass span (from..to) is the clock - the
// sensor-health front's own next byte (the toll owns the rides, the
// windows own the DURATION). The synthetic lines below ride the
// emitter's own grammar byte for byte (the v0.875.0 precedent:
// pre-field tests pin the shape, the field face rides the next fire's
// artifact read); face 144's own read (0 blind pass lines on 128)
// prices the honest zero's row.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SENTRY_PASS_RE } from '../../src/lib/sentry.mjs'
import { sensorWindowsBook, sensorWindowsConsistent, sensorWindowsRow } from '../../src/lib/sensorwindow.mjs'

// the emitter's own grammar, byte for byte (the face-144 skins ride
// verbatim: the n/a land + the hit land; the o2 slot rides the three
// parser skins: value / reset(-1) / ?)
const pass = (bot, n, o2) =>
  `${bot} [${bot}] water: pass ${n} head=wet shore=none land=n/a y=60.4 o2=${o2} probes=0 at=[-134,60,387]`

test('the grammar pin - the parser\'s own line, whole-anchored, the reuse law', () => {
  // the one-parser law by reuse: the lib never re-spells the pass
  // grammar - the sentry's own RE matches the emitter's exact skins
  assert.ok(SENTRY_PASS_RE.test(pass('F19', 0, 15)))
  assert.ok(SENTRY_PASS_RE.test(pass('F19', 3, 'reset(-1)')))
  assert.ok(SENTRY_PASS_RE.test(pass('F19', 4, '?')))
  // the lib's row rides the parser's own bot byte (the fold's own split)
  const b = sensorWindowsBook([pass('F19', 0, 'reset(-1)')])
  assert.equal(b.perBot.F19.reads, 1)
})

test('the window law - consecutive blind reads ride one window, the numeric read closes it', () => {
  const lines = [
    pass('F1', 4, 'reset(-1)'),
    pass('F1', 5, 'reset(-1)'),
    pass('F1', 6, 20),
    pass('F1', 7, 'reset(-1)')
  ]
  const b = sensorWindowsBook(lines)
  assert.equal(b.reads, 4)
  assert.equal(b.blind, 3)
  assert.equal(b.windows, 2, 'the numeric o2 at pass 6 closed the window - pass 7 opened the next')
  assert.deepEqual(b.perBot.F1, { reads: 4, blind: 3, windows: 2, longestRun: 2 })
  assert.deepEqual(b.longest, { bot: 'F1', reads: 2, from: 4, to: 5 }, 'the earliest seat wins the tie')
})

test('the per-bot split - the streams ride apart, the fleet sums the cells', () => {
  const lines = [
    pass('F1', 4, 'reset(-1)'),
    pass('F2', 1, 'reset(-1)'),
    pass('F1', 5, 'reset(-1)'),
    pass('F19', 0, 15),
    pass('F1', 6, 20)
  ]
  const b = sensorWindowsBook(lines)
  assert.equal(b.bots, 3)
  assert.equal(b.reads, 5)
  assert.equal(b.blind, 3)
  assert.equal(b.windows, 2, 'F1\'s run (pass 4..5) + F2\'s own single - the per-bot split owns the windows')
  assert.deepEqual(b.perBot.F1, { reads: 3, blind: 2, windows: 1, longestRun: 2 })
  assert.deepEqual(b.perBot.F2, { reads: 1, blind: 1, windows: 1, longestRun: 1 })
  assert.deepEqual(b.perBot.F19, { reads: 1, blind: 0, windows: 0, longestRun: 0 })
})

test('the face-144 honesty - the sighted face prices the zero shape', () => {
  const lines = [pass('F19', 0, 15), pass('F19', 3, 20), pass('F19', 7, 12)]
  const b = sensorWindowsBook(lines)
  assert.equal(b.blind, 0)
  assert.equal(b.windows, 0)
  assert.equal(b.longest, null)
  assert.match(sensorWindowsRow(b), /blind 0 \(0%\) - 0 window\(s\) - the longest none/)
})

test('the row byte verbatim - the fold\'s own words at the new stamp', () => {
  const lines = [
    pass('F1', 4, 'reset(-1)'),
    pass('F1', 5, 'reset(-1)'),
    pass('F1', 6, 20),
    pass('F2', 1, 'reset(-1)')
  ]
  const b = sensorWindowsBook(lines)
  assert.equal(
    sensorWindowsRow(b),
    'the sensor window\'s own book (v0.881.0): 4 read(s) - blind 3 (75%) - 2 window(s) - the longest F1 2 read(s) (pass 4..5) - per-bot: F1 3/2 (run 2), F2 1/1 (run 1)'
  )
})

test('the junk battery - the honest nulls and the skipped skins', () => {
  assert.equal(sensorWindowsBook(null), null, 'non-array reads null')
  assert.equal(sensorWindowsBook('a raw blob'), null, 'the caller splits first')
  assert.equal(sensorWindowsBook([]), null, 'zero reads stay silent (the v0.379.0 law)')
  assert.equal(sensorWindowsBook(['prose', '', 42, null]), null, 'non-pass lines are skipped, the honest null rides')
  // a pass line with a broken tail is the parser's own refusal
  assert.equal(sensorWindowsBook(['F1 [F1] water: pass x head=wet o2=5']), null)
})

test('the fence battery - a book that cannot prove itself prices nothing', () => {
  const b = sensorWindowsBook([pass('F1', 4, 'reset(-1)'), pass('F1', 5, 'reset(-1)')])
  assert.equal(sensorWindowsConsistent(b), true, 'the fold\'s own arithmetic proves itself')
  assert.equal(sensorWindowsRow(sensorWindowsConsistent({ ...b, reads: 99 })), null, 'the sums must agree')
  assert.equal(sensorWindowsRow(sensorWindowsConsistent({ ...b, longest: { bot: 'F9', reads: 2, from: 4, to: 5 } })), null, 'the seat must ride the fold\'s own words')
  assert.equal(sensorWindowsRow(null), null)
})

test('the decompose WIRING pins - the import band, the print site beside the o2 census\'s own, the lib bytes', () => {
  const src = readFileSync('scripts/fleet-mining/decompose.mjs', 'utf8')
  assert.ok(src.includes("import { sensorWindowsBook, sensorWindowsRow } from '../../src/lib/sensorwindow.mjs'"), 'the import band grew')
  assert.ok(src.includes('sensorWindowsBook(lines)'), 'the print site rides the lines in scope')
  const lib = readFileSync('src/lib/sensorwindow.mjs', 'utf8')
  assert.ok(lib.includes("import { parseSentryPass } from './sentry.mjs'"), 'the one-parser law by reuse')
  assert.ok(lib.includes("(v0.881.0)"), 'the stamp rides the lib\'s own header')
})

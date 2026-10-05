import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAIN_FREEZE_LINE_RE,
  MAIN_FREEZE_GAUGE_RE,
  MAIN_FREEZE_OTHER_LABEL,
  mainFreezeCensus,
  mainFreezeRow
} from '../../src/lib/mainfreeze.mjs'

test('the face byte-exact: the 53s pf:queue freeze with its gauge anchor and the loop tail', () => {
  const gauge = '[hb] n=28 ts=561s rss=460M late=126ms mainLate=53387ms'
  const dump = "[blackbox] main freeze ~53s; last: other @+0.0s <- other @+-1.2s <- other @+-1.2s <- other @+-1.9s <- other @+-3.8s <- pf:queue fuel commons w @+-4.7s <- other @+-4.8s <- other @+-5.7s; loop: timers=1257 imm=65561622/20s (healthy)"
  const { freezes, row } = mainFreezeCensus([gauge, dump])
  assert.equal(freezes.length, 1)
  assert.equal(freezes[0].seconds, 53)
  assert.equal(freezes[0].ts, 561)
  assert.equal(freezes[0].named, 'pf:queue fuel commons w @+-4.7s')
  assert.equal(freezes[0].loopVerdict, 'healthy')
  assert.equal(row, "main freeze census: 1 freeze: ~53s @ts561s named 'pf:queue fuel commons w @+-4.7s' (loop healthy)")
})

test('the bare-era gauge variant: an unbracketed b] head anchors the position too (the family tolerance)', () => {
  const { freezes } = mainFreezeCensus([
    'b] n=3 ts=99s rss=300M late=80ms mainLate=9000ms',
    '[blackbox] main freeze ~6s; last: pf:goal deploy @+0.0s'
  ])
  assert.equal(freezes[0].ts, 99)
})

test('the v0.65-era dump: no loop tail reads unscoped, the head segment names directly', () => {
  const { freezes, row } = mainFreezeCensus([
    'b] n=9 ts=101s rss=300M late=900ms mainLate=43449ms',
    '[blackbox] main freeze ~51s; last: pf:goal deploy @+0.0s'
  ])
  assert.equal(freezes.length, 1)
  assert.equal(freezes[0].named, 'pf:goal deploy @+0.0s')
  assert.equal(freezes[0].loopVerdict, 'unscoped')
  assert.equal(freezes[0].ts, 101)
  assert.equal(row, "main freeze census: 1 freeze: ~51s @ts101s named 'pf:goal deploy @+0.0s' (loop unscoped)")
})

test('the healthy silence inverted: no freeze still prints the row (the runs-row honest zero)', () => {
  const { freezes, row } = mainFreezeCensus([
    'b] n=1 ts=20s rss=254M late=7ms mainLate=0ms',
    'F1 mined stone',
    'b] n=2 ts=41s rss=339M late=13ms mainLate=342ms'
  ])
  assert.equal(freezes.length, 0)
  assert.equal(row, 'main freeze census: no main freeze')
})

test('the junk laws: ~0s, prose, truncated dumps and empty chains never count', () => {
  const { freezes, row } = mainFreezeCensus([
    '[blackbox] main freeze ~0s; last: pf:queue walk @+0.0s', // the threshold junk
    'the report said the main freeze never came', // prose
    '[blackbox] main freeze ~12s', // truncated - no 'last: '
    '[blackbox] main freeze ~12s; last: ', // empty chain
    'main freeze ~12s; last: pf:queue walk @+0.0s' // missing the [blackbox] prefix
  ])
  assert.equal(freezes.length, 0)
  assert.equal(row, 'main freeze census: no main freeze')
})

test('multi-freeze faces: each freeze carries its own ts, name and verdict in face order', () => {
  const { freezes, row } = mainFreezeCensus([
    'b] n=3 ts=101s rss=310M late=80ms mainLate=43449ms',
    '[blackbox] main freeze ~43s; last: other @+0.0s <- pf:queue walk @+-1.0s; loop: timers=4 imm=12/20s (timers starved)',
    'b] n=7 ts=340s rss=400M late=90ms mainLate=16000ms',
    '[blackbox] main freeze ~16s; last: pf:goal deploy @+0.0s; loop: timers=900 imm=100/20s (healthy)'
  ])
  assert.equal(freezes.length, 2)
  assert.equal(freezes[0].seconds, 43)
  assert.equal(freezes[0].named, 'pf:queue walk @+-1.0s')
  assert.equal(freezes[0].loopVerdict, 'timers starved')
  assert.equal(freezes[0].ts, 101)
  assert.equal(freezes[1].seconds, 16)
  assert.equal(freezes[1].ts, 340)
  assert.equal(row, "main freeze census: 2 freeze(s): ~43s @ts101s named 'pf:queue walk @+-1.0s' (loop timers starved), ~16s @ts340s named 'pf:goal deploy @+0.0s' (loop healthy)")
})

test('the all-other chain names none (unlabeled ticks name nothing)', () => {
  const { freezes } = mainFreezeCensus([
    'b] n=2 ts=50s rss=280M late=10ms mainLate=9000ms',
    '[blackbox] main freeze ~7s; last: other @+0.0s <- other @+-2.0s'
  ])
  assert.equal(freezes.length, 1)
  assert.equal(freezes[0].named, 'none')
})

test('a freeze with no preceding gauge carries no ts segment (never a guessed position)', () => {
  const { freezes, row } = mainFreezeCensus([
    '[blackbox] main freeze ~9s; last: pf:queue walk @+0.0s; loop: timers=1 imm=2/20s (healthy)'
  ])
  assert.equal(freezes[0].ts, null)
  assert.equal(row, "main freeze census: 1 freeze: ~9s named 'pf:queue walk @+0.0s' (loop healthy)")
})

test('the gauge anchor updates: a later gauge re-seats the position for the next freeze', () => {
  const { freezes } = mainFreezeCensus([
    'b] n=1 ts=20s rss=254M late=7ms mainLate=0ms',
    'noise',
    'b] n=5 ts=200s rss=300M late=60ms mainLate=8000ms',
    '[blackbox] main freeze ~6s; last: report:write @+0.1s'
  ])
  assert.equal(freezes[0].ts, 200)
})

test('the regexes and the label constant stay exported for the pins', () => {
  assert.ok(MAIN_FREEZE_LINE_RE.test('[blackbox] main freeze ~5s; last: x @+0.0s'))
  assert.ok(MAIN_FREEZE_GAUGE_RE.test('b] n=1 ts=0s rss=1M late=0ms mainLate=0ms'))
  assert.equal(MAIN_FREEZE_OTHER_LABEL, 'other')
})

test('the row composer is junk-safe on its own (the split-form law)', () => {
  assert.equal(mainFreezeRow([]), 'main freeze census: no main freeze')
  assert.equal(mainFreezeRow(null), 'main freeze census: no main freeze')
  assert.equal(mainFreezeRow([{ seconds: 5 }]), "main freeze census: 1 freeze: ~5s named 'none' (loop unscoped)")
})

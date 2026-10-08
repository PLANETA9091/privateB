import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stormStoryCensus, stormStorySeat, stormStorySeatRow } from '../../src/lib/stormstory.mjs'

// The freeze-storm FATAL's own story (v0.818.0): the sgStory(8) tail the
// heartbeat's own emitter rides on the FATAL byte. Face 96 (run
// 37736268597, the v0.816.0 tree) died mid-window at exit 143 - the main
// pulse froze 5s, rss 840M -> 1902M growing past the 1200M floor, and the
// story rode unnamed: pf:spin walk 5 / other 3 of 8 frames. The census's
// own cells only, zero re-parsing (the v0.802.0 seat law, the v0.815.0
// chest seat's own shape); the strict-majority law (topUnits * 2 >
// total), no solo majority reads the honest mix row; the story-less FATAL
// reads the honest silence; the RSS JUMP line is NOT this class.

// face 96's own FATAL line, byte-exact from the job log (the fleet19
// log's own bytes, the timestamp prefix stripped - the count's own shape)
const FACE96 = '[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 840M -> 1902M growing past the 1200M floor - the closure cannot land; run 36292057377 spent the probe at 2271M and the ceiling SIGTERM lost the race to the V8 OOM at exit 134; last: pf:spin walk @+0.0s <- pf:spin walk @+-0.3s <- other @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- pf:spin walk @+-0.9s)'

test('v0.818.0: the face-96 verbatim through the parser - the spin walk owns the frozen main\'s own last word, byte-exact', () => {
  const c = stormStoryCensus([FACE96])
  assert.equal(c.n, 1, 'one freeze-storm FATAL line - the class\'s own fence')
  assert.equal(c.frames['pf:spin walk'], 5, 'the spin arm\'s own tally (frames 1,2,5,7,8)')
  assert.equal(c.frames.other, 3, 'the rest\'s own tally (frames 3,4,6)')
  assert.equal(Object.keys(c.frames).length, 2, 'the open vocabulary\'s own two labels')
  const seat = stormStorySeat(c.frames)
  assert.equal(seat.total, 8, 'the book is the frames\' own sum')
  assert.equal(seat.owner, 'pf:spin walk')
  assert.equal(seat.units, 5)
  assert.equal(seat.share, 0.625)
  assert.equal(seat.bad, 0)
  assert.equal(stormStorySeatRow(seat), 'the freeze storm\'s own story (v0.818.0): pf:spin walk owns 5 of 8 story frame(s) (62.5%) - THE FROZEN MAIN\'S OWN LAST WORD: the locked pulse\'s final frames rode this label (the label\'s own front prices the freeze)')
})

test('v0.818.0: the strict-majority fence - exactly-at-half owns nothing, the even tie reads the mix row, the solo book reads 100%', () => {
  // exactly at half: 4 of 8 refuses the seat (4 * 2 > 8 is false)
  const half = stormStorySeatRow(stormStorySeat({ 'pf:spin walk': 4, other: 4 }))
  assert.equal(half, 'the freeze storm\'s own story (v0.818.0): no solo label owns the story book (the mix owns nothing)')
  // the even tie: 2 - 2 of 4 - the byte order holds the rank, the law holds the silence
  const tie = stormStorySeat({ 'pf:queue': 2, 'pf:goal': 2 })
  assert.equal(tie.owner, null, 'a tie owns nothing')
  assert.equal(tie.total, 4)
  // the solo book: the lone label at its own 100% (the lone-arm precedent)
  const solo = stormStorySeatRow(stormStorySeat({ 'pf:spin walk': 8 }))
  assert.equal(solo, 'the freeze storm\'s own story (v0.818.0): pf:spin walk owns 8 of 8 story frame(s) (100.0%) - THE FROZEN MAIN\'S OWN LAST WORD: the locked pulse\'s final frames rode this label (the label\'s own front prices the freeze)')
  // the majority holds: 6 of 8
  const maj = stormStorySeat({ 'pf:spin walk': 6, other: 2 })
  assert.equal(maj.owner, 'pf:spin walk')
  assert.equal(maj.units, 6)
  assert.equal(maj.share, 0.75)
})

test('v0.818.0: the story-less FATAL reads the honest silence + the class fence + the junk battery', () => {
  // the bbRead-empty shape: the FATAL killed before the story could ride
  const bare = stormStoryCensus(['[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 840M -> 1902M growing past the 1200M floor - the closure cannot land; run 36292057377 spent the probe at 2271M and the ceiling SIGTERM lost the race to the V8 OOM at exit 134)'])
  assert.equal(bare.n, 1, 'the FATAL still counts')
  assert.equal(Object.keys(bare.frames).length, 0, 'no story - no frames')
  assert.equal(stormStorySeat(bare.frames), null, 'the empty book reads the honest silence')
  assert.equal(stormStorySeatRow(stormStorySeat(bare.frames)), null)
  // the class fence: the RSS JUMP story and the frozen-burst FATAL are NOT this class
  const fence = stormStoryCensus([
    '[stormguard] RSS JUMP: rss 386M -> 925M (+539M in 5s = 107.8MB/s, below the 1200M floor - the forming-storm leg; last: pf:goal @+0.0s <- other @+-0.3s)',
    '[stormguard] FATAL (frozen burst: main pulse frozen 5s, rss 380M -> 1004M (+624M in 5s = 124.7MB/s >= 40MB/s, below the 1200M floor - the burst does not wait for it) - the closure cannot land; last: other @+0.0s <- pf:spin walk @+-0.3s)',
  ])
  assert.equal(fence.n, 0, 'neither line rides the freeze-storm book')
  // junk: a non-string line, a frame part without the separator, an empty label
  const junk = stormStoryCensus([FACE96, 42, null, '[stormguard] FATAL (freeze storm: x; last: pf:spin walk 0.0s <- other @+-0.3s)'])
  assert.equal(junk.n, 2, 'the garbage line still fences as FATAL (the byte is the byte)')
  assert.equal(junk.frames['pf:spin walk'], 5, 'the separator-less part is skipped - the spin tally stays face 96\'s own 5')
  assert.equal(junk.frames.other, 4, 'face 96\'s own 3 + the junk line\'s own 1')
  // junk sources: the non-array non-string reads null
  assert.equal(stormStoryCensus(null), null)
  assert.equal(stormStoryCensus(42), null)
  // a string source splits its own lines
  assert.equal(stormStoryCensus(FACE96).n, 1)
})

test('v0.818.0: the row guards + the WIRING one-truth fold', () => {
  // the guards: junk seats never print
  assert.equal(stormStorySeatRow(null), null)
  assert.equal(stormStorySeatRow({ total: 0, owner: 'x', units: 0, share: 0 }), null)
  assert.equal(stormStorySeatRow({ total: 8, owner: 'pf:spin walk', units: 9, share: 1.2 }), null, 'units beyond the book never print')
  assert.equal(stormStorySeatRow({ total: 8, owner: '', units: 5, share: 0.625 }), null, 'an empty owner is not a label')
  assert.equal(stormStorySeatRow({ total: 8, owner: 42, units: 5, share: 0.625 }), null)
  assert.equal(stormStorySeat(stormStoryCensus([FACE96]).frames).total, 8, 'the WIRING fold: the seat\'s book is the frames\' own sum')
  // the mix row rides the seat's own owner-null shape (the chest-close law)
  const mixSeat = stormStorySeat({ 'pf:spin walk': 4, other: 4 })
  assert.equal(mixSeat.owner, null)
  assert.equal(stormStorySeatRow(mixSeat), 'the freeze storm\'s own story (v0.818.0): no solo label owns the story book (the mix owns nothing)')
})

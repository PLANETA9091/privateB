import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stormStoryCensus, stormStorySeat, stormStorySeatRow, stormFormingCensus, stormFormingSeat, stormFormingSeatRow } from '../../src/lib/stormstory.mjs'

// The forming storm's own story (v0.819.0): the RSS JUMP byte's own class
// - the SAME law as the v0.818.0 freeze-storm story seat, the fence's
// other leg. Face 96 (run 37736268597) carried exactly ONE jump line and
// its sgStory(8) tail read the SAME frame chain as the FATAL's own
// (pf:spin walk 5 / other 3 of 8, the ring's 10s-earlier echo) - the spin
// walk owned the forming storm AND the kill, one front priced twice. A
// jump without a following FATAL is the re-armed storm - the near-miss
// faces' own early book. The story-less jump reads the honest silence.

// face 96's own jump line, byte-exact from the mined fleet19 artifact
const FACE96_JUMP = '[stormguard] RSS JUMP: rss 382M -> 840M (+458M in 5s = 91.5MB/s, below the 1200M floor - the forming-storm leg the kill lines never name; last: pf:spin walk @+0.0s <- pf:spin walk @+-0.3s <- other @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- pf:spin walk @+-0.9s)'

test('v0.819.0: the face-96 jump verbatim through the parser - the spin walk owns the early word too, byte-exact', () => {
  const c = stormFormingCensus([FACE96_JUMP])
  assert.equal(c.n, 1, 'one RSS JUMP line - the class\'s own fence')
  assert.equal(c.frames['pf:spin walk'], 5, 'the spin arm\'s own tally (the ring\'s own echo)')
  assert.equal(c.frames.other, 3)
  const seat = stormFormingSeat(c.frames)
  assert.equal(seat.owner, 'pf:spin walk')
  assert.equal(seat.units, 5)
  assert.equal(seat.total, 8)
  assert.equal(seat.share, 0.625)
  assert.equal(stormFormingSeatRow(seat), 'the forming storm\'s own story (v0.819.0): pf:spin walk owns 5 of 8 story frame(s) (62.5%) - THE FORMING STORM\'S OWN EARLY WORD: the re-armed watch\'s first frames rode this label (the label\'s own front prices the cure before the kill)')
})

test('v0.819.0: one law two words - the forming seat folds into the story seat, the mix shapes read both words', () => {
  const frames = { 'pf:spin walk': 4, other: 4 }
  const fSeat = stormFormingSeat(frames)
  const sSeat = stormStorySeat(frames)
  assert.deepEqual({ ...fSeat }, { ...sSeat }, 'the pass-through is the one-truth move - the law lives once')
  assert.equal(fSeat.owner, null, 'the even split owns nothing (the strict-majority law)')
  assert.equal(stormFormingSeatRow(fSeat), 'the forming storm\'s own story (v0.819.0): no solo label owns the story book (the mix owns nothing)')
  assert.equal(stormStorySeatRow(sSeat), 'the freeze storm\'s own story (v0.818.0): no solo label owns the story book (the mix owns nothing)')
  // the majority holds: 6 of 8 on both words
  const maj = { 'pf:spin walk': 6, other: 2 }
  assert.equal(stormFormingSeatRow(stormFormingSeat(maj)), 'the forming storm\'s own story (v0.819.0): pf:spin walk owns 6 of 8 story frame(s) (75.0%) - THE FORMING STORM\'S OWN EARLY WORD: the re-armed watch\'s first frames rode this label (the label\'s own front prices the cure before the kill)')
  // the solo book at its own 100% (the lone-arm precedent)
  const solo = stormFormingSeatRow(stormFormingSeat({ 'pf:goal': 8 }))
  assert.equal(solo, 'the forming storm\'s own story (v0.819.0): pf:goal owns 8 of 8 story frame(s) (100.0%) - THE FORMING STORM\'S OWN EARLY WORD: the re-armed watch\'s first frames rode this label (the label\'s own front prices the cure before the kill)')
})

test('v0.819.0: the cross-fence battery - each class rides its own byte only, the story-less jump the honest silence', () => {
  const FATAL96 = '[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 840M -> 1902M growing past the 1200M floor - the closure cannot land; run 36292057377 spent the probe at 2271M and the ceiling SIGTERM lost the race to the V8 OOM at exit 134; last: pf:spin walk @+0.0s <- pf:spin walk @+-0.3s <- other @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- other @+-0.3s <- pf:spin walk @+-0.3s <- pf:spin walk @+-0.9s)'
  // the forming census fences OUT the FATAL, the story census fences OUT the jump
  assert.equal(stormFormingCensus([FATAL96]).n, 0, 'the FATAL byte rides no forming seat')
  assert.equal(stormStoryCensus([FACE96_JUMP]).n, 0, 'the jump byte rides no kill seat')
  // both books together - the pools stay separate (face 96's own echo shape)
  const both = stormFormingCensus([FACE96_JUMP, FATAL96])
  assert.equal(both.n, 1, 'only the jump counts here')
  assert.equal(both.frames['pf:spin walk'], 5, 'the pool is the jump\'s own 5 - the FATAL\'s frames never cross')
  // the story-less jump (the bbRead-empty shape) reads the honest silence
  const bare = stormFormingCensus(['[stormguard] RSS JUMP: rss 382M -> 840M (+458M in 5s = 91.5MB/s, below the 1200M floor - the forming-storm leg the kill lines never name)'])
  assert.equal(bare.n, 1, 'the jump still counts')
  assert.equal(stormFormingSeat(bare.frames), null, 'no story - no book - the honest silence')
  assert.equal(stormFormingSeatRow(stormFormingSeat(bare.frames)), null)
})

test('v0.819.0: the junk battery + the row guards', () => {
  // junk sources and junk parts never invent a frame
  const junk = stormFormingCensus([FACE96_JUMP, 42, null, '[stormguard] RSS JUMP: rss 1M -> 2M (+1M in 5s; last: pf:spin walk 0.0s <- pf:goal @+-0.1s)'])
  assert.equal(junk.n, 2, 'the garbage line still fences as a jump (the byte is the byte)')
  assert.equal(junk.frames['pf:spin walk'], 5, 'the separator-less part is skipped - the spin tally stays face 96\'s own 5')
  assert.equal(junk.frames['pf:goal'], 1, 'the junk line\'s own well-formed frame still rides')
  // the non-array non-string reads null; the string source splits its own lines
  assert.equal(stormFormingCensus(null), null)
  assert.equal(stormFormingCensus(42), null)
  assert.equal(stormFormingCensus(FACE96_JUMP).n, 1)
  // the row guards (the shared base's own law)
  assert.equal(stormFormingSeatRow(null), null)
  assert.equal(stormFormingSeatRow({ total: 0, owner: null, units: 0, share: 0 }), null)
  assert.equal(stormFormingSeatRow({ total: 8, owner: 'pf:spin walk', units: 9, share: 1.2 }), null, 'units beyond the book never print')
  assert.equal(stormFormingSeatRow({ total: 8, owner: '', units: 5, share: 0.625 }), null, 'an empty owner is not a label')
  assert.equal(stormFormingSeatRow({ total: 8, owner: 42, units: 5, share: 0.625 }), null)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideBook } from '../../src/lib/decidebook.mjs'

// THE ERA BYTE-EXACT - face 43 (run 37509214512) rode the decide door's
// own turn: unreachable 41, decide 18, the no-path lane silent (the
// v0.716.0 bill's fuel clean). The lines below are the face's own bytes;
// the book's debut read names the shared dead goals and the bank's
// unpositioned tail.

test('the 43rd\'s own decide bytes - the shared dead goals and the bank\'s tail', () => {
  const face = [
    'F1 [F1] hop: chest at [-111,79,408] d=13 zero: chest unreachable (Took to long to decide path to goal!)',
    'F7 [F7] hop: chest at [-111,79,408] d=13 zero: chest unreachable (Took to long to decide path to goal!)',
    'F4 [F4] hop: chest at [-146,79,408] d=14 zero: chest unreachable (Took to long to decide path to goal!)',
    'F5 [F5] hop: chest at [-146,79,408] d=14 zero: chest unreachable (Took to long to decide path to goal!)',
    'F15 [F15] hop: chest at [-127,79,392] d=37 zero: chest unreachable (Took to long to decide path to goal!)',
    'F1 [F1] hop: chest at [-106,79,408] d=46 zero: chest unreachable (Took to long to decide path to goal!)',
    'F15 bank: chest unreachable (Took to long to decide path to goal!) (17 blocks from yard) - walking back',
    'F2 bank: chest unreachable (Took to long to decide path to goal!) (23 blocks from yard) - walking back'
  ]
  const book = decideBook(face)
  assert.ok(book, 'the decide face opens the book')
  assert.equal(book.n, 8)
  assert.equal(book.distinct, 6)
  assert.deepEqual(book.byBot, { F1: 2, F15: 2, F7: 1, F4: 1, F5: 1, F2: 1 })
  assert.deepEqual(book.repeats, { F1: 2, F15: 2 })
  // the goal book: the columns are CROSS-BOT (F1+F7 to one chest, F4+F5 to
  // another - the same chest the pathfinder could not decide to twice)
  assert.equal(book.distinctGoals, 4)
  assert.deepEqual(book.byGoal, {
    '-111,79,408': 2, '-146,79,408': 2, '-127,79,392': 1, '-106,79,408': 1
  })
  assert.deepEqual(book.goalRepeats, { '-111,79,408': 2, '-146,79,408': 2 })
  // the bank's skins ride byBot honestly, no coordinate - the unpositioned
  assert.equal(book.unpositioned, 2)
})

test('the honest silences - no face, junk, and the other why-tails stay null', () => {
  assert.equal(decideBook(), null)
  assert.equal(decideBook(null), null)
  assert.equal(decideBook(''), null)
  assert.equal(decideBook(['junk', 7, null]), null)
  // the door read but the starver was another - the book's silence
  const otherTails = [
    'F1 [F1] hop: chest at [-111,79,408] d=13 zero: chest unreachable (No path to the goal!)',
    'F15 bank: chest unreachable (No path to the goal!) (17 blocks from yard) - walking back',
    'F9 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
  ]
  assert.equal(decideBook(otherTails), null)
})

test('the shared dead goal - three bots one chest names the goal-side cure', () => {
  const face = [
    'F3 [F3] hop: chest at [-111,79,408] d=13 zero: chest unreachable (Took to long to decide path to goal!)',
    'F7 [F7] hop: chest at [-111,79,408] d=13 zero: chest unreachable (Took to long to decide path to goal!)',
    'F12 [F12] hop: chest at [-111,79,408] d=13 zero: chest unreachable (Took to long to decide path to goal!)'
  ]
  const book = decideBook(face)
  assert.ok(book, 'the shared-goal face opens the book')
  assert.equal(book.n, 3)
  // THE CROWD LAW'S DECIDE TWIN: the goal's column is cross-bot - one
  // chest, three refusals (the goal-side cure: the chest is the patient,
  // not the bots); the bots stay spread (no repeats)
  assert.deepEqual(book.goalRepeats, { '-111,79,408': 3 })
  assert.equal(book.distinctGoals, 1)
  assert.deepEqual(book.repeats, {})
  assert.equal(book.distinct, 3)
  assert.equal(book.unpositioned, 0)
})

test('the bank\'s unpositioned skin rides byBot, not byGoal - and the nudge family stays out', () => {
  const face = [
    'F15 bank: chest unreachable (Took to long to decide path to goal!) (17 blocks from yard) - walking back',
    'F2 bank: chest unreachable (Took to long to decide path to goal!) (23 blocks from yard) - walking back',
    'F15 bank: chest unreachable (Took to long to decide path to goal!) (17 blocks from yard) - walking back'
  ]
  const book = decideBook(face)
  assert.ok(book, 'the bank face opens the book')
  assert.equal(book.n, 3)
  assert.deepEqual(book.byBot, { F15: 2, F2: 1 })
  assert.deepEqual(book.repeats, { F15: 2 })
  assert.deepEqual(book.byGoal, {})
  assert.deepEqual(book.goalRepeats, {})
  assert.equal(book.distinctGoals, 0)
  assert.equal(book.unpositioned, 3)
  // the blob form splits by newline
  const blob = face.join('\n')
  assert.equal(decideBook(blob).n, 3)
})

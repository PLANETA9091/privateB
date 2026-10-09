// THE WALK FLOOR PREFLIGHT'S OWN BOOK (v0.874.0) - the v0.872.0 gate's
// refusals own WHO+WHERE fold. The preflight line rides the 'chest skip'
// filter-key the fleet already carries, so the face logs speak - but a
// lens that cannot fold the class leaves the verdict unnamed (the
// v0.866.0 lesson: bytes visible, seats unowned). The book folds the
// preflight's own line shape: per bot (the WHO), the d/price/left bands
// (the two sides of the affordability question), the clause's own
// majority (the grace's verdict names the seat). The wrapper adds exactly
// ONE trailing paren - the clause may or may not carry its own, so the
// fold strips exactly one tail paren. Junk-safe: a non-matching line is
// not a refusal; a zero-refusal face prices nothing (the honest silence);
// the fence law stands.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chestWalkPreflightBook, chestWalkPreflightBookConsistent, chestWalkPreflightBookRow } from '../../src/lib/chestdoor.mjs'

const L_GRACE = '[F19] chest skip (walk floor preflight: d=26 prices 30s beyond the 4s left - the grace already rode (one-shot per chain))'
const L_ENVELOPE = '[F19] chest skip (walk floor preflight: d=45 prices 30s beyond the 60s left - d=45 beyond the grace envelope (40) - the doom guard stands)'
const L_CAP = '[F13] chest skip (walk floor preflight: d=51 prices 31s beyond the 4s left - d=51 prices 31s beyond the grace cap (30s) - the doom guard stands)'
const L_JUNKCELL = '[F2] chest skip (walk floor preflight: d=0 prices 30s beyond the 4s left - the distance reads junk - affordability unproven)'

test('the fold: the preflight lines name their WHO, bands and the clause majority', () => {
  const book = chestWalkPreflightBook([L_GRACE, L_ENVELOPE, L_GRACE])
  assert.equal(book.n, 3)
  assert.deepEqual({ ...book.bots }, { F19: 3 })
  assert.deepEqual(book.d, { min: 26, max: 45, avg: 32.3 })
  assert.deepEqual(book.priceS, { min: 30, max: 30, avg: 30 })
  assert.deepEqual(book.leftS, { min: 4, max: 60, avg: 22.7 })
  assert.deepEqual({ ...book.clauses }, {
    'the grace already rode (one-shot per chain)': 2,
    'd=45 beyond the grace envelope (40) - the doom guard stands': 1
  })
  assert.equal(book.seatClause, 'the grace already rode (one-shot per chain)')
  assert.equal(book.seat, "THE ONE-SHOT'S OWN EXHAUST")
})

test('the seats: each clause maps to its own seat', () => {
  for (const [line, seat] of [
    [L_GRACE, "THE ONE-SHOT'S OWN EXHAUST"],
    [L_ENVELOPE, "THE ENVELOPE'S OWN DOOM GUARD"],
    [L_CAP, "THE CAP'S OWN DOOM GUARD"],
    [L_JUNKCELL, "THE JUNK CELL'S OWN HONESTY"]
  ]) {
    const book = chestWalkPreflightBook([line])
    assert.equal(book.seat, seat, `${seat} owns its clause`)
    assert.ok(chestWalkPreflightBookConsistent(book))
  }
})

test('the wrapper-paren law: exactly ONE tail paren stripped, the clause keeps its own', () => {
  // the grace clause carries its own parens and rides the wrapper's as a second
  const book = chestWalkPreflightBook([L_GRACE])
  assert.deepEqual(Object.keys(book.clauses), ['the grace already rode (one-shot per chain)'])
  // the envelope clause ends 'stands)' - the wrapper's paren alone
  const env = chestWalkPreflightBook([L_ENVELOPE])
  assert.deepEqual(Object.keys(env.clauses), ['d=45 beyond the grace envelope (40) - the doom guard stands'])
})

test('the tie law: no clause majority reads the honest spread', () => {
  const book = chestWalkPreflightBook([L_GRACE, L_ENVELOPE])
  assert.equal(book.seatClause, null)
  assert.equal(book.seat, null)
  assert.ok(chestWalkPreflightBookConsistent(book), 'the spread is still a consistent book')
  const row = chestWalkPreflightBookRow(book)
  assert.match(row, /THE SPREAD IS THE SHAPE: no clause owns the book - the tie law held$/)
})

test('the unnamed clause: an unknown tail still folds under its own seat name', () => {
  const line = '[F7] chest skip (walk floor preflight: d=20 prices 30s beyond the 3s left - some future clause the gate grew)'
  const book = chestWalkPreflightBook([line])
  assert.equal(book.seat, 'THE UNNAMED CLAUSE')
  assert.equal(book.seatClause, 'some future clause the gate grew')
})

test('the honest silences: a face with no preflight refusals prices nothing', () => {
  assert.equal(chestWalkPreflightBook([]), null)
  assert.equal(chestWalkPreflightBook(['no preflight here']), null)
  assert.equal(chestWalkPreflightBook(['[F1] chest skip (doomed goal cached 3s ago at [1,64,2])']), null, 'other skip classes are not the preflight')
  assert.equal(chestWalkPreflightBook(null), null)
  assert.equal(chestWalkPreflightBook('lines'), null)
  assert.equal(chestWalkPreflightBook([42, null, undefined, {}]), null)
  // a truncated line (no tail clause) is not a refusal
  assert.equal(chestWalkPreflightBook(['[F1] chest skip (walk floor preflight: d=26 prices 30s']), null)
})

test('the fence law: an inconsistent book renders nothing', () => {
  assert.equal(chestWalkPreflightBookConsistent(null), false)
  assert.equal(chestWalkPreflightBookConsistent({}), false)
  assert.equal(chestWalkPreflightBookConsistent({ n: 0 }), false)
  assert.equal(chestWalkPreflightBookConsistent({ n: 2, bots: { F1: 2 }, d: { min: 5, max: 3, avg: 4 }, priceS: { min: 1, max: 2, avg: 1.5 }, leftS: { min: 1, max: 2, avg: 1.5 }, clauses: { x: 2 } }), false, 'min>max is a lie')
  assert.equal(chestWalkPreflightBookConsistent({ n: 2, bots: {}, d: { min: 1, max: 3, avg: 2 }, priceS: { min: 1, max: 2, avg: 1.5 }, leftS: { min: 1, max: 2, avg: 1.5 }, clauses: { x: 2 } }), false, 'no bots is a lie')
  assert.equal(chestWalkPreflightBookConsistent({ n: 2, bots: { F1: 2 }, d: { min: 1, max: 3, avg: 2 }, priceS: { min: 1, max: 2, avg: 1.5 }, leftS: { min: 1, max: 2, avg: 1.5 }, clauses: {} }), false, 'no clauses is a lie')
})

test('the row: exact bytes for a pinned book', () => {
  const book = chestWalkPreflightBook([L_GRACE, L_JUNKCELL])
  assert.match(
    chestWalkPreflightBookRow(book),
    /2 refusal\(s\) by 2 bot\(s\) \(F19\+F2\), d 0\.\.26 avg 13 - prices 30\.\.30 s vs 4\.\.4 s left - THE SPREAD IS THE SHAPE: no clause owns the book - the tie law held$/,
    'a 1-1 clause tie renders the spread row (the honest spread, the fence law)'
  )
  const pinned = chestWalkPreflightBook([L_GRACE, L_GRACE, L_JUNKCELL])
  assert.equal(
    chestWalkPreflightBookRow(pinned),
    "the walk floor preflight's own book (v0.874.0): 3 refusal(s) by 2 bot(s) (F19+F2), d 0..26 avg 17.3 - prices 30..30 s vs 4..4 s left - THE ONE-SHOT'S OWN EXHAUST: the grace already rode (one-shot per chain)"
  )
  assert.equal(chestWalkPreflightBookRow(null), null)
  assert.equal(chestWalkPreflightBookRow('junk'), null)
})

test('WIRING: decompose imports the book and prints it beside the budget-floor book', () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{[^}]*chestWalkPreflightBook, chestWalkPreflightBookRow[^}]*\} from '\.\.\/\.\.\/src\/lib\/chestdoor\.mjs'/)
  assert.match(src, /const cwpb = chestWalkPreflightBook\(lines\)/)
  assert.match(src, /chestWalkPreflightBookRow\(cwpb\)/)
  // the print site rides beside the budget-floor book's own (the import band's order)
  const cbfbAt = src.indexOf('const cbfb = chestBudgetFloorBook(lines)')
  const cwpbAt = src.indexOf('const cwpb = chestWalkPreflightBook(lines)')
  assert.ok(cbfbAt > 0 && cwpbAt > cbfbAt, 'the preflight book prints after the budget-floor book')
})

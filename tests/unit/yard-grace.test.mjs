// THE YARD GRACE (v0.303.0) - the walk floor's one-shot short-class pardon.
//
// Fleet 36525740882 (the v0.302.0 tree's first field) measured the class:
// F10's final bank chain climbed to the yard (15 steps, 62 dug) and arrived
// d=9..16 from FOUR chests with the chain clock spent - 14x 'budget exhausted
// (walk floor)', ALL at d=9..16 (the v0.56.0 short-hop class, physically ~8s,
// pinned at 15s), and the 270u pocket - the face's TOP write-off holder -
// stranded at the yard among the chests. The cure: the FIRST short-class
// floor refusal in a chain converts to a bounded CHEST_WALK_SHORT_MS walk;
// every later refusal stays byte-identical; junk distance = no affordability
// proof = the floor verdict stands; the floor arithmetic itself is UNTOUCHED.
//
// (v0.867.0) THE GRACE'S OWN DISTANCE LEVER - face 136 (37894029206) read
// the budget-floor's first live majority at d 23..29 avg 26 (the FAR band
// 13 of 20, F19=20): the v0.303.0 pardon never reached the class that owns
// the verdict now. The far walk is priced by the hop's OWN ruler
// (chestWalkBudgetMs - the one-ruler law) and admitted when the price fits
// YARD_GRACE_FAR_CAP_MS; the envelope edge YARD_GRACE_FAR_DIST=40 keeps the
// doom guard for the far-far class; the short class keeps its flat 15s.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { yardGraceGate, CHEST_WALK_SHORT_DIST, CHEST_WALK_SHORT_MS, BUDGET_WALK_FLOOR_MS, effectiveWalkBudget, chestWalkBudgetMs, YARD_GRACE_FAR_DIST, YARD_GRACE_FAR_CAP_MS } from '../../src/lib/deposit.mjs'

test('the F10 datum: a d<=16 floor refusal grants the 15s grace (byte-intact)', () => {
  // F10's refusals read d=9..16 - the whole class converts
  for (const d of [1, 9, 12, 15, 16]) {
    const g = yardGraceGate({ dist: d, graceUsed: false })
    assert.equal(g.grant, true, `d=${d} grants`)
    assert.equal(g.budgetMs, CHEST_WALK_SHORT_MS, `d=${d} rides the short-hop pin`)
    assert.match(g.why, /provably affordable/)
    assert.equal(g.why, 'the short walk is provably affordable', 'the short why stays byte-identical')
  }
  // the boundary: 16 is the short class, past it the FAR class answers (v0.867.0)
  assert.equal(yardGraceGate({ dist: 16 }).grant, true)
  assert.equal(yardGraceGate({ dist: 16.5 }).grant, true, 'past 16 the far lever answers')
  assert.equal(yardGraceGate({ dist: 17 }).grant, true)
  assert.equal(yardGraceGate({ dist: 40 }).grant, true)
  assert.match(yardGraceGate({ dist: 41 }).why, /beyond the grace envelope/)
  assert.match(yardGraceGate({ dist: 40 }).why, /its own ruler/)
})

test('the face-136 far band: the grace prices by the hop\'s OWN ruler (the one-ruler law)', () => {
  // face 136's budget-floor rides read d 23..29 avg 26 - the whole band converts
  for (const d of [17, 23, 25, 27, 29, 40]) {
    const g = yardGraceGate({ dist: d, graceUsed: false })
    assert.equal(g.grant, true, `d=${d} grants`)
    assert.equal(g.budgetMs, chestWalkBudgetMs(d), `d=${d} rides the ruler, not a new pin`)
    assert.equal(g.budgetMs, 30000, 'the band sits on the ruler\'s 30s base floor')
    assert.match(g.why, /its own ruler/)
  }
  // the short class KEEPS its vetted flat 15s even though the ruler reads 30s there
  assert.equal(yardGraceGate({ dist: 12 }).budgetMs, CHEST_WALK_SHORT_MS)
})

test('the far lever\'s junk law: junk params fall back to the pins, never widen or swallow', () => {
  // junk farCapMs -> the 30000 default (the band grants)
  assert.equal(yardGraceGate({ dist: 25, farCapMs: NaN }).grant, true)
  assert.equal(yardGraceGate({ dist: 25, farCapMs: -1 }).budgetMs, 30000)
  // a tighter cap REFUSES honestly (the price exceeds the borrow)
  const tight = yardGraceGate({ dist: 25, farCapMs: 10000 })
  assert.equal(tight.grant, false)
  assert.match(tight.why, /beyond the grace cap/)
  // junk farDist -> the 40 default
  assert.equal(yardGraceGate({ dist: 41, farDist: NaN }).grant, false)
  assert.match(yardGraceGate({ dist: 41, farDist: NaN }).why, /beyond the grace envelope \(40\)/)
  // a WIDER envelope admits more, but the ruler's cap still binds
  assert.equal(yardGraceGate({ dist: 50, farDist: 60 }).budgetMs, 30000)
  const far60 = yardGraceGate({ dist: 60, farDist: 60 })
  assert.equal(far60.grant, false, 'd=60 prices 35s - beyond the 30s borrow cap')
  assert.match(far60.why, /beyond the grace cap/)
  // a NARROWING farDist cannot swallow the short class (the flat 15s stands)
  assert.equal(yardGraceGate({ dist: 12, farDist: 10 }).budgetMs, CHEST_WALK_SHORT_MS)
  assert.equal(yardGraceGate({ dist: 14, farDist: 10 }).grant, true)
})

test('one-shot: a chain grants once - the retry storm stays impossible', () => {
  const g2 = yardGraceGate({ dist: 9, graceUsed: true })
  assert.equal(g2.grant, false)
  assert.match(g2.why, /already rode/)
  // junk graceUsed reads as NOT used (undefined = the first call)
  assert.equal(yardGraceGate({ dist: 9, graceUsed: undefined }).grant, true)
})

test('junk-safe: no affordability proof, no grace', () => {
  for (const dist of [null, undefined, NaN, Infinity, 0, -3, '12', {}, () => {}]) {
    const g = yardGraceGate({ dist })
    assert.equal(g.grant, false, `dist=${String(dist)} refuses`)
    assert.match(g.why, /junk/)
    assert.equal(g.budgetMs, 0)
  }
})

test('junk params fall back to the pinned class, never widen it', () => {
  // junk shortDist -> the 16 default; junk graceMs -> the 15000 default
  // (v0.867.0) d=30 now rides the FAR lever, so the fallback reads at the
  // envelope edge: junk or not, past 40 the doom guard stands
  assert.equal(yardGraceGate({ dist: 41, shortDist: NaN }).grant, false, 'the junk cap falls back to 16, 41 stays beyond the envelope')
  assert.equal(yardGraceGate({ dist: 12, shortDist: NaN }).budgetMs, CHEST_WALK_SHORT_MS)
  assert.equal(yardGraceGate({ dist: 12, graceMs: -1 }).budgetMs, CHEST_WALK_SHORT_MS)
  // a custom cap only WIDENS when the caller proves the bigger class
  assert.equal(yardGraceGate({ dist: 30, shortDist: 32, graceMs: 9000 }).grant, true)
  assert.equal(yardGraceGate({ dist: 30, shortDist: 32, graceMs: 9000 }).budgetMs, 9000)
})

test('the floor arithmetic is UNTOUCHED - the grace is a separate decision', () => {
  // effectiveWalkBudget refuses exactly as before (the v0.27.0 contract)
  assert.equal(effectiveWalkBudget({ distBudget: 20000, remainingMs: 4999 }), 0, 'below the 5s floor: 0')
  assert.equal(effectiveWalkBudget({ distBudget: 20000, remainingMs: 5000 }), 5000, 'at the floor: the remaining passes')
  assert.equal(effectiveWalkBudget({ distBudget: 20000, remainingMs: Infinity }), 20000, 'unbounded: the legacy behavior')
  assert.equal(BUDGET_WALK_FLOOR_MS, 5000)
  assert.equal(CHEST_WALK_SHORT_DIST, 16)
  assert.equal(CHEST_WALK_SHORT_MS, 15000)
  assert.equal(YARD_GRACE_FAR_DIST, 40)
  assert.equal(YARD_GRACE_FAR_CAP_MS, 30000)
})

test('WIRING PIN: the grace rides the walk floor refusal sites, the verdict stays byte-identical', () => {
  const src = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  // the entry site: the floor refusal consults the grace BEFORE the throw
  assert.match(src, /let ms = effectiveWalkBudget\(\{ distBudget: budget, remainingMs: remaining\(\) \}\)\n    if \(ms <= 0\) ms = graceTopUp\('entry'\)\n    if \(ms <= 0\) throw new Error\('budget exhausted \(walk floor\)'\)/)
  // the post-approach site joins (the bot is CLOSER there - the F10 shape's sibling)
  assert.match(src, /if \(ms <= 0\) ms = graceTopUp\('post-approach'\)/)
  // exactly two grace sites, one gate definition, one holder per chain scope
  assert.equal(src.match(/graceTopUp\('/g).length, 2)
  assert.equal(src.match(/export function yardGraceGate/g).length, 1)
  assert.match(src, /const yardGrace = \{ used: false \}/)
  // the chain threads the holder into every chest hop
  assert.match(src, /yardGraceHolder: yardGrace \}/)
  // a refused grace re-throws the BYTE-IDENTICAL floor verdict (the filter keys hold)
  assert.match(src, /yard grace: not granted \(\$\{g\.why\}\) - the floor verdict stands/)
  assert.match(src, /yard grace: the d=\$\{Math\.round\(dGrace\)\} walk rides the one-shot/)
  // (v0.867.0) the grant line prints the GATE'S OWN why - the short and the far
  // classes read differently by design, the log never lies about the class
  assert.match(src, /the floor refused - \$\{g\.why\}/)
  assert.doesNotMatch(src, /the floor refused - the short walk is provably affordable/, 'the hardcoded short why retired with the flat class')
  // the gate is pure: no bot/date access inside its body
  const body = src.slice(src.indexOf('export function yardGraceGate'), src.indexOf('export function chestWalkBudgetMs'))
  assert.doesNotMatch(body, /Date\.now|bot\./, 'the gate reads only its arguments')
})

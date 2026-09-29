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
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { yardGraceGate, CHEST_WALK_SHORT_DIST, CHEST_WALK_SHORT_MS, BUDGET_WALK_FLOOR_MS, effectiveWalkBudget } from '../../src/lib/deposit.mjs'

test('the F10 datum: a d<=16 floor refusal grants the 15s grace', () => {
  // F10's refusals read d=9..16 - the whole class converts
  for (const d of [1, 9, 12, 15, 16]) {
    const g = yardGraceGate({ dist: d, graceUsed: false })
    assert.equal(g.grant, true, `d=${d} grants`)
    assert.equal(g.budgetMs, CHEST_WALK_SHORT_MS, `d=${d} rides the short-hop pin`)
    assert.match(g.why, /provably affordable/)
  }
  // the boundary: 16 is the class, 17 is not
  assert.equal(yardGraceGate({ dist: 16 }).grant, true)
  assert.equal(yardGraceGate({ dist: 16.5 }).grant, false, 'past the pinned class the doom guard stands')
  assert.equal(yardGraceGate({ dist: 17 }).grant, false)
  assert.match(yardGraceGate({ dist: 40 }).why, /beyond the short class/)
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
  assert.equal(yardGraceGate({ dist: 30, shortDist: NaN }).grant, false, 'the junk cap falls back to 16, 30 stays beyond')
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
  // the gate is pure: no bot/date access inside its body
  const body = src.slice(src.indexOf('export function yardGraceGate'), src.indexOf('export function chestWalkBudgetMs'))
  assert.doesNotMatch(body, /Date\.now|bot\./, 'the gate reads only its arguments')
})

// THE PAGE LEAD'S OWN BOOK - the pagelead tests (v0.875.0).
// The rescue-ran mirror's own lead byte - '(paged Ns before death)' -
// unread since v0.477.0 shipped the cue join: the join read a lead only
// from the controls-blind prose ('sight died Ns before death' - o2gap's
// sightDiedSecs), so every rescue-ran death rode 'sight died ?s' in the
// decompose row and the effective window (v0.480.0) priced it unpriced:
// face 142 read 'unpriced 3' of 4. The verbatim lines below are
// SYNTHETIC, built from the emitter's own templates byte for byte (the
// v0.873.0 precedent: pre-field tests pin the shape, the field face
// rides the next fire's artifact read). The deaths ride o2Gap's OWN
// grammar (one parser per emitter - the test forks nothing); the saves
// ride rescue-ledger's own classifier (entrywindow's own filter).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { o2Gap } from '../../src/lib/o2gap.mjs'
import { pageLeadBook, pageLeadBookConsistent, pageLeadBookRow, pageLeadBookRidersRow, PAGE_LEAD_RE, LAST_BREATH_MAX_S } from '../../src/lib/pagelead.mjs'

// the emitter's own templates (miner.mjs's death handler, byte for byte)
const mirrorRescue = (bot, lead, o2, snap) =>
  `${bot} [${bot}] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged ${lead}s before death) - its own timeline lines own the failure (o2 ${o2}, head WET, snapshot ${snap}s old)`
const MIRROR_BLIND = `F14 [F14] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry's sight died 25s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 20, head dry/unknown, snapshot 24.5s old)`
const ctx = (bot, o2, rescue, leg, wet) =>
  `${bot} [${bot}] death: drown context (o2 ${o2}, feet water, head water, rescue ${rescue}, leg ${leg}, ${wet})`
const save = (bot, s) => `${bot} [${bot}] water: rescue complete (shore reached) in ${s}s`

// face 142's own chain, verbatim shapes, with the lane's own seven
// saves (min 0 / median 2.3 / max 6.7 - the real face's own bands)
const FACE = [
  save('F2', '0'), save('F3', '1.1'), save('F5', '2'),
  save('F7', '2.3'), save('F9', '2.9'), save('F12', '4.4'),
  save('F18', '6.7'),
  mirrorRescue('F4', '2.4', 'reset(-1)', '2.4'),
  ctx('F4', 'reset(-1)', '2s ago', 'deploy', 'wet 12s'),
  mirrorRescue('F1', '2.4', 'reset(-1)', '2.4'),
  ctx('F1', 'reset(-1)', '2s ago', 'unknown', 'wet 14s'),
  mirrorRescue('F11', '1.8', 'reset(-1)', '1.8'),
  ctx('F11', 'reset(-1)', 'active', 'deploy', 'wet 1s'),
  MIRROR_BLIND,
  ctx('F14', 'reset(-1)', '214s ago', 'walk to chest', 'wet 0s@last')
]

test('THE GRAMMAR PIN: the page lead is the emitter\'s own prose, mid-line, both forms', () => {
  assert.equal(PAGE_LEAD_RE.exec(mirrorRescue('F4', '2.4', 'reset(-1)', '2.4'))[1], '2.4', 'the fraction form')
  assert.equal(PAGE_LEAD_RE.exec(mirrorRescue('F4', '2', 'reset(-1)', '2'))[1], '2', 'the integer form - the v0.707.0 lesson')
  const padded = `noise (paged 1.8s before death) tail`
  assert.equal(PAGE_LEAD_RE.exec(padded)[1], '1.8', 'the prose reads mid-line - a caller prefix or suffix never rides it')
  assert.equal(PAGE_LEAD_RE.exec(MIRROR_BLIND), null, 'the controls-blind prose carries no page - the kind\'s own shape')
  assert.equal(LAST_BREATH_MAX_S, 3)
})

test('THE FACE-142 FOLD: four deaths, the kinds seat, the leads, the window', () => {
  const o2g = o2Gap(FACE)
  assert.equal(o2g.deaths, 4, 'o2Gap\'s own fold - one grammar')
  const b = pageLeadBook(o2g, FACE)
  assert.ok(pageLeadBookConsistent(b), 'the book proves itself')
  assert.equal(b.deaths, 4)
  assert.deepEqual(b.kinds, { 'rescue-ran': 3, 'controls-blind': 1 })
  assert.equal(b.leads.count, 3)
  assert.equal(b.leads.min, 1.8)
  assert.equal(b.leads.max, 2.4)
  assert.ok(Math.abs(b.leads.avg - 2.2) < 1e-9, `the avg reads 2.2 (got ${b.leads.avg})`)
  assert.equal(b.unpaged, 0, 'every rescue-ran death carried its page')
  assert.deepEqual(b.seat, { kind: 'rescue-ran', n: 3, total: 4 }, 'the strict majority seats')
  assert.equal(b.lastBreath, true, 'all leads under 3s - the last breath\'s own page')
  assert.deepEqual(b.window, { saves: 7, min: 0, median: 2.3, max: 6.7, fits: 0, tight: 2, misses: 1, unpriced: 1 })
  assert.deepEqual(b.perDeath.F4, { lead: 2.4, kind: 'rescue-ran', verdict: 'tight' })
  assert.deepEqual(b.perDeath.F11, { lead: 1.8, kind: 'rescue-ran', verdict: 'misses' })
  assert.deepEqual(b.perDeath.F14, { lead: null, kind: 'controls-blind', verdict: 'unpriced' })
})

test('THE ROW BYTE VERBATIM: the face-142 row, exact', () => {
  const b = pageLeadBook(o2Gap(FACE), FACE)
  assert.equal(
    pageLeadBookRow(b),
    "the page lead's own book (v0.875.0): 4 drown death(s) - kind seat: rescue-ran owns 3 of 4 (75.0%) - paged 1.8..2.4s avg 2.2s (3 page(s), all under 3s - THE LAST BREATH'S OWN PAGE: the sentry pages at the o2 reset, the lane inherits the damage window) - the page window vs the lane's own saves (n 7, median 2.3s): fits 0 / tight 2 / misses 1 / unpriced 1 - the page arrives too late for the typical save: the trigger must fire at o2 low, not at the reset"
  )
  assert.equal(
    pageLeadBookRidersRow(b),
    'F4 [paged 2.4s - tight] F1 [paged 2.4s - tight] F11 [paged 1.8s - misses] F14 [no page - controls-blind]'
  )
})

test('THE JOIN LAW: the latest mirror wins whole - a pageless mirror between the page and the death eats the lead', () => {
  const lines = [
    mirrorRescue('F4', '5', 'reset(-1)', '5'),
    MIRROR_BLIND.replaceAll('F14', 'F4'),
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s')
  ]
  const b = pageLeadBook(o2Gap(lines), lines)
  assert.equal(b.deaths, 1)
  assert.deepEqual(b.kinds, { 'controls-blind': 1 }, 'the kind rides the LATEST mirror - not the older page')
  assert.equal(b.leads, null, 'the older page never survives a newer pageless mirror')
  assert.equal(b.unpaged, 0, 'the death rode controls-blind - the honest no-page by kind, never unpaged')
  assert.equal(b.lastBreath, false)
  assert.deepEqual(b.perDeath.F4, { lead: null, kind: 'controls-blind', verdict: 'unpriced' })
})

test('THE POSITIONAL LAW: the lead joins at-or-before the death - a later page never joins an earlier death', () => {
  const lines = [
    mirrorRescue('F4', '5', 'reset(-1)', '5'),
    ctx('F4', 'reset(-1)', '2s ago', 'deploy', 'wet 2s'),
    mirrorRescue('F4', '2', 'reset(-1)', '2'),
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 1s')
  ]
  const b = pageLeadBook(o2Gap(lines), lines)
  assert.equal(b.deaths, 2, 'one bot, two deaths - the counts ride the death line')
  assert.equal(b.leads.count, 2, 'both pages priced - the counts never fold from the last-wins map')
  assert.deepEqual(b.leads, { min: 2, max: 5, avg: 3.5, count: 2 })
  assert.equal(b.perDeath.F4.lead, 2, 'the perDeath map stays o2gap\'s own last-wins shape (the house wart)')
  assert.ok(pageLeadBookConsistent(b), 'the fence holds on the repeat-death face')
  assert.match(pageLeadBookRow(b), /2 drown death\(s\)/)
})

test('THE SEAT LAWS: the strict majority seats, the tie reads the spread', () => {
  const tie = [
    mirrorRescue('F4', '2', 'reset(-1)', '2'),
    ctx('F4', 'reset(-1)', '2s ago', 'deploy', 'wet 2s'),
    MIRROR_BLIND.replaceAll('F14', 'F1'),
    ctx('F1', 'reset(-1)', '2s ago', 'deploy', 'wet 2s')
  ]
  const b = pageLeadBook(o2Gap(tie), tie)
  assert.equal(b.seat, null, '1-1 reads no seat - the spread is the shape')
  assert.match(pageLeadBookRow(b), /kind seat: the spread is the shape \(no strict majority\)/)
})

test('THE UNPAGED HONESTY: a rescue-ran mirror without the page prose names the emitter\'s own gap', () => {
  const lines = [
    'F4 [F4] water: breath mirror [rescue-ran] - the rescue lane owned the death window - its own timeline lines own the failure (o2 reset(-1), head WET, snapshot 2s old)',
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s')
  ]
  const b = pageLeadBook(o2Gap(lines), lines)
  assert.equal(b.deaths, 1)
  assert.deepEqual(b.kinds, { 'rescue-ran': 1 })
  assert.equal(b.leads, null, 'no page lead rode')
  assert.equal(b.unpaged, 1, 'the kind ran, the page never parsed - the honest gap')
  assert.ok(pageLeadBookConsistent(b), 'the fence holds: paged 0 + unpaged 1 = rescue-ran 1')
  assert.match(pageLeadBookRow(b), /paged: none \(no page lead rode\)/)
  assert.match(pageLeadBookRidersRow(b), /F4 \[no page - rescue-ran\]/)
})

test('THE WINDOW BANDS: fits / tight / misses / unpriced, and no saves prices nothing', () => {
  const bands = [
    save('F2', '1'), save('F3', '3'), save('F5', '5'),
    mirrorRescue('F4', '5', 'reset(-1)', '5'),
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s'),
    mirrorRescue('F1', '3', 'reset(-1)', '3'),
    ctx('F1', 'reset(-1)', 'active', 'deploy', 'wet 2s'),
    mirrorRescue('F11', '1.8', 'reset(-1)', '1.8'),
    ctx('F11', 'reset(-1)', 'active', 'deploy', 'wet 2s')
  ]
  const b = pageLeadBook(o2Gap(bands), bands)
  assert.deepEqual(b.window, { saves: 3, min: 1, median: 3, max: 5, fits: 1, tight: 1, misses: 1, unpriced: 0 })
  assert.match(pageLeadBookRow(b), /fits 1 \/ tight 1 \/ misses 1 \/ unpriced 0/)
  const dry = [
    mirrorRescue('F4', '2', 'reset(-1)', '2'),
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s')
  ]
  const b2 = pageLeadBook(o2Gap(dry), dry)
  assert.equal(b2.window.saves, 0)
  assert.equal(b2.window.median, null)
  assert.equal(b2.window.unpriced, 1, 'no saves in the face - the honest blind spot')
  assert.match(pageLeadBookRow(b2), /the page window unpriced \(no lane saves in the face\)/)
})

test('THE LAST-BREATH LAW: a lead at or beyond 3s drops the clause, the row stays honest', () => {
  const lines = [
    save('F2', '1'),
    mirrorRescue('F4', '4.2', 'reset(-1)', '4.2'),
    ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s')
  ]
  const b = pageLeadBook(o2Gap(lines), lines)
  assert.equal(b.lastBreath, false, '4.2s >= the 3s band - the page led the air window, not the reset')
  assert.doesNotMatch(pageLeadBookRow(b), /THE LAST BREATH'S OWN PAGE/)
})

test('THE ONE-GRAMMAR FENCE: a book whose deaths disagree with o2Gap\'s own fold prices nothing', () => {
  const b = pageLeadBook({ deaths: 9, perBot: {} }, FACE)
  assert.equal(b, null, 'two walks of one grammar must agree - a mismatch is a forked reader')
})

test('THE JUNK BATTERY: the honest nulls', () => {
  const o2g = o2Gap(FACE)
  assert.equal(pageLeadBook(null, FACE), null)
  assert.equal(pageLeadBook(undefined, FACE), null)
  assert.equal(pageLeadBook('junk', FACE), null)
  assert.equal(pageLeadBook(o2g, null), null)
  assert.equal(pageLeadBook(o2g, undefined), null)
  assert.equal(pageLeadBook(o2g, 'raw blob'), null, 'a raw blob reads null - the caller splits first (entrywindow\'s own fence)')
  assert.equal(pageLeadBook(o2g, []), null, 'no lines - the row stays silent')
  assert.equal(pageLeadBook({ deaths: 0, perBot: {} }, FACE), null)
  const junkLines = [null, 42, {}, mirrorRescue('F4', '2.4', 'reset(-1)', '2.4'), ctx('F4', 'reset(-1)', 'active', 'deploy', 'wet 2s')]
  const b = pageLeadBook(o2Gap(junkLines.filter(l => typeof l === 'string')), junkLines)
  assert.equal(b.deaths, 1, 'non-string lines are skipped, the real rows ride')
  assert.equal(pageLeadBookRow(null), null)
  assert.equal(pageLeadBookRow('junk'), null)
  assert.equal(pageLeadBookRidersRow(null), null)
  assert.equal(pageLeadBookRidersRow('junk'), null)
  assert.equal(pageLeadBookRow({ deaths: 2, kinds: { 'rescue-ran': 1 }, unpaged: 0, leads: null, window: { saves: 1, min: 1, median: 1, max: 1, fits: 0, tight: 0, misses: 0, unpriced: 1 }, perDeath: {} }), null, 'the kinds do not sum - the fence refuses')
})

test('WIRING: decompose imports the book and prints it beside the effective window', () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{[^}]*pageLeadBook, pageLeadBookRow, pageLeadBookRidersRow[^}]*\} from '\.\.\/\.\.\/src\/lib\/pagelead\.mjs'/)
  assert.match(src, /const plb = pageLeadBook\(o2g, lines\)/)
  assert.match(src, /pageLeadBookRow\(plb\)/)
  assert.match(src, /pageLeadBookRidersRow\(plb\)/)
  // the print site rides beside the effective window's own (the import band's order)
  const ewAt = src.indexOf('const ew = entryWindow(o2g, lines)')
  const plbAt = src.indexOf('const plb = pageLeadBook(o2g, lines)')
  assert.ok(ewAt > 0 && plbAt > ewAt, 'the page lead prints after the effective window')
})

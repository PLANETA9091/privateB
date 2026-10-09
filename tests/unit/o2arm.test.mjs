// THE ARM-O2'S OWN BOOK - the o2arm tests (v0.878.0).
//
// The rescue start's own oxygen byte ('drowning rescue start (drowning,
// oxygen N)') - unread since v0.368.0 counted the start classes and the
// v0.422.0 census counted the PASSES' o2: the starts' own air never
// rode a book. The verbatim lines below are SYNTHETIC, built from the
// emitter's own templates byte for byte (the v0.875.0 precedent:
// pre-field tests pin the shape, the field face rides the next fire's
// artifact read). Face 143's own shape rides the fold verbatim: 41
// arms (blind 3 / critical 7 / band 18 / headroom 13 - the spread is
// the shape), the fatal arm rode BLIND (oxygen -1 - the sensor died
// before the start, the F1 death joined the latest arm whole).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { o2Gap } from '../../src/lib/o2gap.mjs'
import { ARM_O2_RE, ARM_CRITICAL_MAX, ARM_HEADROOM_MIN, armBand, o2ArmBook, o2ArmBookConsistent, o2ArmBookRow, o2ArmBookRidersRow } from '../../src/lib/o2arm.mjs'

const start = (bot, o2) => `${bot} [${bot}] water: drowning rescue start (drowning, oxygen ${o2})`
const death = (bot, o2, rescue, wet) =>
  `${bot} [${bot}] death: drown context (o2 ${o2}, feet water, head water, rescue ${rescue}, leg unknown, wet ${wet}s)`
const died = (bot) => `${bot} [${bot}] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env [the inference is blind to this kind])`

// face 143's own arm census, verbatim distribution (41 arms: o2=6 x15,
// o2=4 x4, o2=20 x3, o2=13 x3, o2=-1 x3, o2=3 x2, o2=15 x2, o2=12 x2,
// o2=10 x2, and 9/7/5/2/19 once each), with the F1 fatal tail: the
// latest arm before the death rode BLIND (oxygen -1).
const FACE143 = [
  ...Array.from({ length: 6 }, () => start('F5', 6)),
  ...Array.from({ length: 4 }, () => start('F8', 4)),
  start('F19', 20), start('F19', 20), start('F19', 20), start('F19', 15),
  start('F17', 13), start('F17', 13),
  start('F3', 13),
  start('F12', 3), start('F12', 3),
  start('F10', 15),
  start('F18', 12),
  start('F2', 10),
  start('F6', 10),
  ...Array.from({ length: 4 }, () => start('F11', 6)),
  ...Array.from({ length: 5 }, () => start('F16', 6)),
  start('F16', -1),
  start('F13', 9),
  start('F9', 7),
  start('F4', 5),
  start('F7', 2),
  start('F14', 19),
  start('F1', 12),
  start('F1', -1),
  start('F1', -1),
  died('F1'),
  death('F1', 'reset(-1)', 'active', 2)
]

test('the grammar pin - the emitter\'s own line, whole-anchored, both skins', () => {
  const num = ARM_O2_RE.exec(start('F5', 12))
  assert.ok(num, 'the numeric skin rides')
  assert.equal(num[1], 'F5')
  assert.equal(num[2], '12')
  const blind = ARM_O2_RE.exec(start('F1', -1))
  assert.ok(blind, 'the blind -1 skin rides')
  assert.equal(blind[2], '-1')
  // junk-safe: a caller prefix or a caller suffix never rides
  assert.equal(ARM_O2_RE.exec(`x ${start('F5', 12)}`), null)
  assert.equal(ARM_O2_RE.exec(`${start('F5', 12)} y`), null)
  // the wet class's own line is not the drowning start's byte
  assert.equal(ARM_O2_RE.exec('F5 [F5] water: wet rescue start (wet, oxygen 12)'), null)
})

test('the band edges - the sentry census\'s own constants, never forked', () => {
  assert.equal(ARM_CRITICAL_MAX, 4)
  assert.equal(ARM_HEADROOM_MIN, 10)
  assert.equal(armBand(null), 'blind')
  assert.equal(armBand(0), 'critical')
  assert.equal(armBand(4), 'critical')
  assert.equal(armBand(5), 'band')
  assert.equal(armBand(9), 'band')
  assert.equal(armBand(10), 'headroom')
  assert.equal(armBand(20), 'headroom')
})

test('the face-143 fold verbatim - 41 arms, the spread is the shape, the fatal arm blind', () => {
  const o2g = o2Gap(FACE143)
  assert.ok(o2g, 'the o2 gap folded')
  assert.equal(o2g.deaths, 1)
  const b = o2ArmBook(o2g, FACE143)
  assert.ok(b, 'the book folded')
  assert.equal(b.starts, 41)
  assert.equal(b.blindArms, 3)
  assert.deepEqual(b.bands, { blind: 3, critical: 7, band: 18, headroom: 13 })
  assert.deepEqual(b.spread, { min: 2, max: 20, avg: 327 / 38, count: 38 })
  assert.equal(b.seat, null, '18 of 41 is no strict majority - the spread is the shape')
  assert.equal(b.deaths, 1)
  assert.deepEqual(b.verdicts, { blind: 1, critical: 0, band: 0, headroom: 0, unarmed: 0 })
  assert.deepEqual(b.perDeath.F1, { o2: null, band: 'blind' })
})

test('the row byte verbatim - face 143\'s own read', () => {
  const b = o2ArmBook(o2Gap(FACE143), FACE143)
  assert.equal(
    o2ArmBookRow(b),
    'the rescue arm\'s own o2 book (v0.878.0): 41 arm(s) - o2 2..20 avg 8.6 (38 numeric arm(s), blind 3) - arm seat: the spread is the shape (no strict majority) - the fatal arm(s): blind 1 / critical 0 / band 0 / headroom 0 / unarmed 0 - the blind arm prices nothing - the sensor\'s own seat owns the lane (the sensor\'s health is the front, the trigger\'s constant is moot while the arm rides blind)'
  )
})

test('the riders byte verbatim - the blind arm\'s own bracket', () => {
  const b = o2ArmBook(o2Gap(FACE143), FACE143)
  assert.equal(o2ArmBookRidersRow(b), 'F1 [arm o2 -1 - blind]')
})

test('the join law whole - the latest start wins, the death resets, the order is the truth', () => {
  // the latest start at-or-before the death joins (oxygen 3, not 12)
  const lines = [
    start('F2', 12),
    start('F2', 3),
    died('F2'),
    death('F2', 'reset(-1)', 'active', 2)
  ]
  const b = o2ArmBook(o2Gap(lines), lines)
  // o2 3 rides the census's own critical edge (<=4, never forked)
  assert.deepEqual(b.perDeath.F2, { o2: 3, band: 'critical' })
  // the death reset: the arm never survives the death it joined - the
  // first death joins its own latest start (o2 12, headroom), the arm
  // is spent, and the second death joins only the NEW start (o2 9)
  const lines2 = [
    start('F2', 12),
    died('F2'),
    death('F2', 'reset(-1)', 'active', 2),
    start('F2', 9),
    died('F2'),
    death('F2', 'reset(-1)', 'active', 3)
  ]
  const b2 = o2ArmBook(o2Gap(lines2), lines2)
  assert.equal(b2.deaths, 2, 'the counts ride the death line - two deaths')
  assert.deepEqual(b2.perDeath.F2, { o2: 9, band: 'band' }, 'the map rides last-wins (the house wart)')
  assert.deepEqual(b2.verdicts, { blind: 0, critical: 0, band: 1, headroom: 1, unarmed: 0 }, 'the first death joined its own start (the latest start wins), the reset spent it, the second joined the new start')
})

test('the line-order law - a start after the death never joins it', () => {
  const lines = [
    died('F3'),
    death('F3', 'reset(-1)', 'never', 4),
    start('F3', 15)
  ]
  const b = o2ArmBook(o2Gap(lines), lines)
  assert.deepEqual(b.perDeath.F3, { o2: null, band: 'unarmed' })
  assert.deepEqual(b.verdicts, { blind: 0, critical: 0, band: 0, headroom: 0, unarmed: 1 })
})

test('the band seats - the strict majority seats, the tie reads the spread', () => {
  const maj = [
    start('F5', 6), start('F5', 6), start('F5', 6),
    start('F8', 20), start('F8', 12),
    died('F5'),
    death('F5', 'reset(-1)', 'active', 2)
  ]
  const bm = o2ArmBook(o2Gap(maj), maj)
  assert.deepEqual(bm.seat, { band: 'band', n: 3, total: 5 })
  assert.match(o2ArmBookRow(bm), /arm seat: band owns 3 of 5 \(60\.0%\)/)
  const tie = [
    start('F5', 6), start('F5', 6),
    start('F8', 20), start('F8', 12),
    start('F9', 2),
    died('F9'),
    death('F9', 'reset(-1)', 'active', 2)
  ]
  const bt = o2ArmBook(o2Gap(tie), tie)
  assert.equal(bt.seat, null, '2 of 5 is no majority - the spread is the shape')
  assert.match(o2ArmBookRow(bt), /arm seat: the spread is the shape \(no strict majority\)/)
})

test('the verdict seats - the four fatal bands price their own lever', () => {
  const mk = (o2, rescue) => {
    const lines = [start('F4', o2), died('F4'), death('F4', 'reset(-1)', rescue, 2)]
    return o2ArmBook(o2Gap(lines), lines)
  }
  assert.match(o2ArmBookRow(mk(4, 'active')), /the lane armed at the damage window - the trigger's constant must ride higher/)
  assert.match(o2ArmBookRow(mk(7, 'active')), /the lane armed inside the band - the constant has the seat/)
  assert.match(o2ArmBookRow(mk(15, 'active')), /the arms rode with headroom - the lane's own execution owns the losses/)
  assert.match(o2ArmBookRow(mk(-1, 'active')), /the blind arm prices nothing/)
})

test('the unarmed honesty - a death with no arm rides its own null', () => {
  const lines = [died('F6'), death('F6', 'reset(-1)', 'never', 4)]
  const b = o2ArmBook(o2Gap(lines), lines)
  assert.deepEqual(b.perDeath.F6, { o2: null, band: 'unarmed' })
  assert.equal(o2ArmBookRidersRow(b), 'F6 [no arm - unarmed]')
  assert.match(o2ArmBookRow(b), /a death rode with no arm since the last death - the lane's own reset owns the gap/)
  assert.match(o2ArmBookRow(b), /no numeric arm rode/)
})

test('the junk battery - the honest nulls and the skipped skins', () => {
  assert.equal(o2ArmBook(null, FACE143), null, 'no o2g - no book')
  assert.equal(o2ArmBook(o2Gap(FACE143), 'a raw blob'), null, 'a raw blob reads null - the caller splits first')
  assert.equal(o2ArmBook({ deaths: 0 }, []), null, 'zero deaths - the row stays silent (the v0.379.0 precedent)')
  assert.equal(o2ArmBook({ deaths: 5 }, FACE143), null, 'the one-grammar law: a deaths mismatch prices nothing')
  // non-string lines are skipped; the string lines still price
  const dirty = [null, 42, start('F5', 6), undefined, died('F5'), death('F5', 'reset(-1)', 'active', 2)]
  const b = o2ArmBook(o2Gap(dirty), dirty)
  assert.ok(b, 'the junk skins skip, the honest lines ride')
  assert.equal(b.starts, 1)
  assert.equal(b.deaths, 1)
  // a clean face with deaths but zero arms still folds (the unarmed face)
  const armless = [died('F7'), death('F7', 'reset(-1)', 'never', 3)]
  const ba = o2ArmBook(o2Gap(armless), armless)
  assert.ok(ba, 'the armless face folds')
  assert.equal(ba.starts, 0)
  assert.equal(ba.spread, null)
  assert.match(o2ArmBookRow(ba), /no numeric arm rode/)
})

test('the fence battery - a book that cannot prove itself prices nothing', () => {
  const good = o2ArmBook(o2Gap(FACE143), FACE143)
  assert.equal(o2ArmBookConsistent(good), true)
  const lie = (patch) => o2ArmBookConsistent({ ...good, ...patch })
  assert.equal(lie({ verdicts: { blind: 2, critical: 0, band: 0, headroom: 0, unarmed: 0 } }), false, 'the verdicts must sum to the deaths')
  assert.equal(lie({ bands: { blind: 0, critical: 0, band: 0, headroom: 0 } }), false, 'the bands must sum to the starts')
  assert.equal(lie({ blindArms: 99 }), false, 'the blind census must agree two ways')
  assert.equal(lie({ spread: { min: 20, max: 2, avg: 8, count: 38 } }), false, 'the spread band honest (min <= max)')
  assert.equal(lie({ perDeath: { F1: { o2: 6, band: 'nope' } } }), false, 'a rider\'s band must be a legal verdict band')
  assert.equal(lie({ deaths: 0 }), false, 'zero deaths prices nothing')
  assert.equal(lie({ starts: -1 }), false, 'a negative start census prices nothing')
  assert.equal(o2ArmBookRow(null), null, 'the row reads null on the absent book')
  assert.equal(o2ArmBookRow(lie({ starts: 40 })), null, 'the row reads null on the lying book')
  assert.equal(o2ArmBookRidersRow(lie({ starts: 40 })), null, 'the riders read null on the lying book')
})

test('the decompose WIRING pins - the import band, the print site beside the page lead\'s own, the lib bytes', () => {
  const dec = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(dec.includes("import { o2ArmBook, o2ArmBookRow, o2ArmBookRidersRow } from '../../src/lib/o2arm.mjs'"), 'the import band grew')
  const site = dec.indexOf('const oab = o2ArmBook(o2g, lines)')
  const plb = dec.indexOf('const plb = pageLeadBook(o2g, lines)')
  assert.ok(site > 0, 'the print site rides')
  assert.ok(plb > 0 && site > plb, 'the arm book prints beside the page lead\'s own (after it)')
  const lib = readFileSync(new URL('../../src/lib/o2arm.mjs', import.meta.url), 'utf8')
  for (const byte of ['ARM_O2_RE', 'o2ArmBook', 'o2ArmBookConsistent', 'o2ArmBookRow', 'o2ArmBookRidersRow', 'armBand']) {
    assert.ok(lib.includes(byte), `the lib byte ${byte} rides`)
  }
})

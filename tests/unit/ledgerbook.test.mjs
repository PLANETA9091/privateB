import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ledgerRecordBook, ledgerRecordBookRow, ledgerRecordBookConsistent } from '../../src/lib/ledgerbook.mjs'

// The v0.868.0 lens: the ledger families' own economy fold. The motive:
// the no-path ledger's record byte ('no-path ledger: chest at [...]
// cached for the fleet (N live, ttl 15s|90s...)') has been FILTER-
// INVISIBLE since v0.62.0 - face 138 priced 18 'No path' hop refusals
// and 65 'chest skip (no path cached ...)' saves while the writes rode
// NOWHERE, and the v0.863.0 half-life's own escalation byte was
// unverifiable in the field. The v0.866.0 un-blinding joined the LEDGER
// FAMILIES to the fleet log filter - this fold prices the ledger's own
// economy from the first face that carries the writes: the records (the
// writes, the chests, the live occupancy, the ttl split), the saves
// (the skips the cache bought), and the leverage (saves / records).

// The record lines ride the emitter's OWN template bytes (deposit.mjs
// v0.62.0 write + v0.863.0 escalation + v0.866.0 filter; the first live
// face is face 139 - face 138's log predates the un-blinding, so the
// write lines below are the emitter's exact shape, junk-tolerant by the
// regex pins). The skip lines are FACE-138 VERBATIM (run 37901165139's
// own fleet19.log rows).

// ---- the face-138 verbatim saves-only face: the blind-records read ----

const FACE138 = [
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,412])',
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,408])',
  'F14 [F14] chest skip (no path cached 0s ago at [-116,72,408])',
  'F16 [F16] chest skip (no path cached 0s ago at [-136,72,390])',
  'F11 [F11] chest skip (no path cached 7s ago at [-137,72,390])',
  'F14 [F14] chest skip (no path cached 9s ago at [-121,72,412])',
  'F14 [F14] chest skip (no path cached 10s ago at [-116,72,410])',
  'F18 [F18] chest skip (no path cached 16s ago at [-137,72,390])'
]

const blind = ledgerRecordBook(FACE138)
assert.equal(blind.records, 0, 'the face-138 records rode blind (the pre-un-blinding face)')
assert.equal(blind.saves, 8, 'the 8 verbatim skips land')
assert.equal(blind.leverage, null, 'no records - no leverage (the honest null)')
const np = blind.families['no-path']
assert.equal(np.records, 0, 'the no-path records rode blind')
assert.equal(np.saves, 8, 'the no-path saves fold')
assert.deepEqual(np.saveBots, { F2: 2, F14: 3, F16: 1, F11: 1, F18: 1 }, 'the save bots fold')
assert.deepEqual(np.saveAge, { n: 8, min: 0, max: 16, avg: 5.3 }, 'the save ages 0..16s avg 5.3')
assert.equal(blind.families['full-chest'].saves, 0, 'the full-chest family stayed silent on face 138')
assert.match(
  ledgerRecordBookRow(blind),
  /^the ledger families' own book \(v0\.868\.0\): no-path 0 record\(s\) bought 8 skip\(s\) \(bots 5 \(F14=3 F2=2 F11=1 F16=1 F18=1\), age 0\.\.16s avg 5\.3\) - the writes rode blind - THE RECORDS RODE BLIND: the log carried the skips but never the writes - the v0\.866\.0 un-blinding reads them from the next face$/,
  'the face-138 row verbatim'
)

// ---- the both-families fold: the writes join the saves ----

const BOTH = [
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  "F14 [F14] no-path ledger: chest at [-135,72,390] cached for the fleet (2 live, ttl 90s (the repeat's own half-life))",
  'F11 [F11] no-path ledger: chest at [-121,72,408] cached for the fleet (1 live, ttl 15s, timeout verdict)',
  'F2 [F2] full-chest ledger: chest at [-116,72,412] cached for the fleet (2 live, ttl 180s)',
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,412])',
  'F16 [F16] chest skip (no path cached 0s ago at [-136,72,390])',
  'F5 [F5] chest skip (full cached 45s ago at [-116,72,406])'
]

const book = ledgerRecordBook(BOTH)
assert.equal(book.records, 4, 'the total records fold (3 no-path + 1 full-chest)')
assert.equal(book.saves, 3, 'the saves fold across both families')
assert.equal(book.leverage, 0.8, 'the total leverage 3/4 rounds to 0.8')
const f = book.families['no-path']
assert.equal(f.records, 3, 'the no-path records')
assert.equal(f.distinctChests, 2, 'two distinct chests paid the writes')
assert.deepEqual(f.chests['-135,72,390'], { n: 2, bots: { F4: 1, F14: 1 } }, 'the twice-recorded chest folds per bot')
assert.deepEqual(f.repeatChests, [{ pos: '-135,72,390', n: 2, bots: { F4: 1, F14: 1 } }], 'the repeat record rides')
assert.deepEqual(f.live, { n: 3, min: 1, max: 2, avg: 1.3 }, 'the live occupancy 1..2 avg 1.3')
assert.equal(f.fresh, 2, 'the fresh 15s writes')
assert.equal(f.escalated, 1, "the escalated write (the repeat's own half-life)")
assert.equal(f.timeout, 1, 'the timeout verdict suffix counts')
assert.equal(f.saves, 2, 'the no-path saves')
assert.deepEqual(f.saveAge, { n: 2, min: 0, max: 0, avg: 0 }, 'the zero ages ride honestly')
assert.equal(f.leverage, 0.7, 'the family leverage 2/3 rounds to 0.7')
const fc = book.families['full-chest']
assert.equal(fc.records, 1, 'the full-chest write')
assert.equal(fc.fresh, 1, 'the full-chest write rides fresh (no escalation - chests do not empty mid-run)')
assert.equal(fc.escalated, 0, 'no escalation in the full-chest family')
assert.deepEqual(fc.live, { n: 1, min: 2, max: 2, avg: 2 }, 'the full-chest live occupancy')
assert.equal(fc.saves, 1, 'the full-chest save')
assert.deepEqual(fc.saveAge, { n: 1, min: 45, max: 45, avg: 45 }, 'the 45s full-cache age')
assert.equal(fc.leverage, 1, 'one write bought one save')
assert.match(
  ledgerRecordBookRow(book),
  /no-path 3 record\(s\) on 2 chest\(s\) \(repeats 1\) \(live 1\.\.2 avg 1\.3 - fresh 2 \/ escalated 1 \/ timeout 1\) bought 2 skip\(s\) \(bots 2 \(F16=1 F2=1\), age 0\.\.0s avg 0\) - leverage 0\.7 skips\/record; full-chest 1 record\(s\) on 1 chest\(s\) \(live 2\.\.2 avg 2 - fresh 1 \/ escalated 0 \/ timeout 0\) bought 1 skip\(s\) \(bots 1 \(F5=1\), age 45\.\.45s avg 45\) - leverage 1 skips\/record/,
  'the both-families row cells'
)

// ---- the seats ----

// The escalation majority outranks everything: the half-life's own face
// (the v0.863.0 cure confirmed in the field).
const esc = ledgerRecordBook([
  "F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 90s (the repeat's own half-life))",
  "F14 [F14] no-path ledger: chest at [-135,72,390] cached for the fleet (2 live, ttl 90s (the repeat's own half-life))",
  'F11 [F11] no-path ledger: chest at [-121,72,408] cached for the fleet (1 live, ttl 15s)'
])
assert.match(
  ledgerRecordBookRow(esc),
  /- THE HALF-LIFE'S OWN FACE: the repeats own the writes - the 90s window rides live \(the v0\.863\.0 cure confirmed in the field\)$/,
  'the escalation seat'
)

// The rent seat: the skips out-run the paid failures.
const rent = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,412])',
  'F16 [F16] chest skip (no path cached 0s ago at [-136,72,390])'
])
assert.match(
  ledgerRecordBookRow(rent),
  /- THE LEDGER PAYS ITS RENT: the skips out-run the paid failures - the fleet-wide cache earns its keep$/,
  'the rent seat'
)

// The waiting seat: the records stand, no hop rode them.
const wait = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)'
])
assert.match(
  ledgerRecordBookRow(wait),
  /- THE LEDGER WAITS: the records stand but no hop rode them - the cache's economy waits for its first skip$/,
  'the waiting seat'
)

// The tie law: saves trail the records, no escalation majority.
assert.match(
  ledgerRecordBookRow(book),
  /- THE LEDGER'S OWN TIE: the skips trail the paid failures - the leverage waits$/,
  'the tie law'
)

// A silent family never rides the row: the full-chest leg stays home.
assert.doesNotMatch(ledgerRecordBookRow(rent), /full-chest/, 'the silent family stays off the row')
assert.match(ledgerRecordBookRow(rent), /^the ledger families' own book \(v0\.868\.0\): no-path /, 'the row opens with the speaking family')

// ---- the honest silences and the out-of-scope families ----

assert.equal(ledgerRecordBook([]), null, 'no lines = silence')
assert.equal(ledgerRecordBook(null), null, 'null input')
assert.equal(ledgerRecordBook(42), null, 'junk input')
assert.equal(ledgerRecordBook(['junk', 7, null]), null, 'junk rows judge nothing')
assert.equal(ledgerRecordBook(['no-path ledger: 1 live verdict(s) at end phase']), null, 'the end-phase census names no chest - not a write')
assert.equal(ledgerRecordBook(['full-chest ledger: 0 live verdict(s) at end phase']), null, 'the full-chest census likewise')
assert.equal(ledgerRecordBook(['F14 [F14] chest skip (doomed goal cached 15s ago at [-137,72,390])']), null, 'the doomed-goal skip is the jobqueue ledger - out of scope')
assert.equal(ledgerRecordBook(['F4 [F4] chest skip (vertical doom: the yard stands 29 levels up over 7b lateral - the walk ladder cannot climb)']), null, 'the vertical-doom skip is the arithmetic gate - no ledger at all')
assert.equal(ledgerRecordBook(['F4 [F4] no-path ledger: chest at [-1,72,-1] cached for the fleet (1 live, ttl 45s)']), null, 'a 45s ttl never prints (the machine rides 15s|90s) - not a write')
assert.equal(ledgerRecordBook(['F4 [F4] full-chest ledger: chest at [-1,72,-1] cached for the fleet (1 live, ttl 180s, timeout verdict)']), null, 'the full-chest write carries no timeout suffix')
assert.equal(ledgerRecordBook(["F4 [F4] no-path ledger: chest at [x,y,z] cached for the fleet (1 live, ttl 15s)"]), null, 'a junk position is not a write')
assert.equal(ledgerRecordBookRow(null), null, 'null book row')
assert.equal(ledgerRecordBookRow(42), null, 'junk book row')

// The mixed face: the out-of-scope rows judge nothing, the in-scope rows
// land with their own families (a doomed skip must not inflate no-path).
const mixed = ledgerRecordBook([
  42, null, 'junk',
  'F14 [F14] chest skip (doomed goal cached 15s ago at [-137,72,390])',
  'F4 [F4] chest skip (vertical doom: the yard stands 29 levels up over 12b lateral - the walk ladder cannot climb)',
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,412])',
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)'
])
assert.equal(mixed.records, 1, 'the junk and out-of-scope rows judge nothing')
assert.equal(mixed.saves, 1, 'only the no-path save lands')
assert.equal(mixed.families['no-path'].saves, 1, 'the doomed skip did not inflate the no-path family')

// ---- the fence battery: a self-inconsistent book never renders ----

const good = ledgerRecordBook(BOTH)
assert.equal(ledgerRecordBookConsistent(good), true, 'the both-families book is consistent')
assert.equal(ledgerRecordBookConsistent(blind), true, 'the blind book is consistent too (the zero legs close)')
const clone = (over) => ({ ...JSON.parse(JSON.stringify(good)), ...over })
assert.equal(ledgerRecordBookConsistent(clone({ records: 2 })), false, 'the totals records break')
assert.equal(ledgerRecordBookConsistent(clone({ saves: 9 })), false, 'the totals saves break')
assert.equal(ledgerRecordBookConsistent(clone({ leverage: 9.9 })), false, 'the totals leverage break')
const famClone = (fam, over) => {
  const b = JSON.parse(JSON.stringify(good))
  b.families[fam] = { ...b.families[fam], ...over }
  return b
}
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { records: 2 })), false, 'the family records break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { fresh: 1 })), false, 'the ttl split break (fresh + escalated !== records)')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { timeout: 9 })), false, 'the timeout break (out-runs the records)')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { live: { n: 2, min: 1, max: 2, avg: 1.3 } })), false, 'the live n break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { live: { n: 3, min: 1, max: 2, avg: 9 } })), false, 'the live avg > max break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { live: null })), false, 'the live null break (records stand)')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { chests: {} })), false, 'the chests sum break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { distinctChests: 5 })), false, 'the distinct break')
const chestBotBreak = JSON.parse(JSON.stringify(good))
chestBotBreak.families['no-path'].chests['-135,72,390'].bots.F4 = 2
assert.equal(ledgerRecordBookConsistent(chestBotBreak), false, 'the chest bots sum break')
const repeatBreak = JSON.parse(JSON.stringify(good))
repeatBreak.families['no-path'].repeatChests[0].n = 1
assert.equal(ledgerRecordBookConsistent(repeatBreak), false, 'the repeat n break (a repeat is n >= 2)')
const repeatSrcBreak = JSON.parse(JSON.stringify(good))
repeatSrcBreak.families['no-path'].repeatChests[0].pos = '-100,71,400'
assert.equal(ledgerRecordBookConsistent(repeatSrcBreak), false, 'the repeat src break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { saveBots: { F2: 5 } })), false, 'the save bots sum break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { saveAge: { n: 5, min: 0, max: 0, avg: 0 } })), false, 'the save age n break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { saveAge: { n: 2, min: 0, max: 0, avg: 9 } })), false, 'the save age avg > max break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { leverage: 9.9 })), false, 'the family leverage break')
assert.equal(ledgerRecordBookConsistent(famClone('full-chest', { escalated: 1, fresh: 0 })), false, 'the full-chest escalation can never ride')
const extraFam = JSON.parse(JSON.stringify(good))
extraFam.families.doomed = JSON.parse(JSON.stringify(good.families['no-path']))
extraFam.records += extraFam.families.doomed.records
extraFam.saves += extraFam.families.doomed.saves
assert.equal(ledgerRecordBookConsistent(extraFam), false, 'an extra family key never renders')
assert.equal(ledgerRecordBookConsistent(null), false, 'null fence')

// ---- WIRING ----

// The decompose prints the book beside the chest-door family's own rows.
const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
assert.match(src, /import \{ ledgerRecordBook, ledgerRecordBookRow \} from '\.\.\/\.\.\/src\/lib\/ledgerbook\.mjs'/, 'the lens rides its own import band')
assert.match(src, /const lrb = ledgerRecordBook\(lines\)/, 'the lens folds the face\'s own lines')
assert.match(src, /if \(lrbRow\) console\.log\(`  \$\{lrbRow\}`\)/, "the book's own print beside the door rows")

// The row's own byte lives in the lib.
const lib = fs.readFileSync(new URL('../../src/lib/ledgerbook.mjs', import.meta.url), 'utf8')
assert.match(lib, /the ledger families' own book \(v0\.868\.0\)/, "the row's own byte lives in the lib")

console.log('ledgerbook.test.mjs: all green')

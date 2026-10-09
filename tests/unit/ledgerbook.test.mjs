import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ledgerRecordBook, ledgerRecordBookRow, ledgerRecordBookConsistent } from '../../src/lib/ledgerbook.mjs'

// The v0.868.0 lens + the v0.869.0 THE SAVE'S OWN PARENT extension: the
// ledger families' own economy fold. The motive: the no-path ledger's
// record byte ('no-path ledger: chest at [...] cached for the fleet (N
// live, ttl 15s|90s...)') has been FILTER-INVISIBLE since v0.62.0 -
// face 138 priced 18 'No path' hop refusals and 65 'chest skip (no path
// cached ...)' saves while the writes rode NOWHERE. The v0.866.0
// un-blinding joined the LEDGER FAMILIES to the fleet log filter; the
// fold prices the ledger's own economy from the first face that carries
// the writes: the records (the writes, the chests, the live occupancy,
// the ttl split), the saves (the skips the cache bought), the leverage
// (saves / records), and - v0.869.0 - every skip's PARENT write (the
// latest prior write within the family's consult reach): same-cell vs
// neighbor (the radius echo) vs orphan, same-bot vs cross-bot, the pass
// gap (the write-to-skip line distance - the same-pass fingerprint).
// The face-139 zero-age read named the shape: 7 of 7 skips rode
// SAME-BOT - the writer's own pass echoing across the neighbor chests
// of a fresh doomed cell (the cross-bot save, the ledger's founding
// purpose, waited - the 15s ttl rarely spans the bot-to-bot passes).

// The record lines ride the emitter's OWN template bytes (deposit.mjs
// v0.62.0 write + v0.863.0 escalation + v0.866.0 filter; the skip lines
// are FACE-138 / FACE-139 VERBATIM (run 37901165139 + run 37908240844's
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
assert.deepEqual(np.parentCell, { sameCell: 0, neighbor: 0, orphan: 8 }, 'no writes in reach - every save an orphan (the blind face)')
assert.deepEqual(np.parentBot, { same: 0, cross: 0 }, 'no parents - no bot split')
assert.equal(np.passGap, null, 'no parents - no pass gap')
assert.equal(blind.families['full-chest'].saves, 0, 'the full-chest family stayed silent on face 138')
assert.match(
  ledgerRecordBookRow(blind),
  /^the ledger families' own book \(v0\.869\.0\): no-path 0 record\(s\) bought 8 skip\(s\) \(bots 5 \(F14=3 F2=2 F11=1 F16=1 F18=1\), age 0\.\.16s avg 5\.3; parents same-cell 0 \/ neighbor 0 \/ orphan 8\) - the writes rode blind - THE RECORDS RODE BLIND: the log carried the skips but never the writes - the v0\.866\.0 un-blinding reads them from the next face$/,
  'the face-138 row verbatim'
)

// ---- the face-139 verbatim self-echo face: THE SAVE'S OWN PARENT ----

// The REAL face-139 timeline rows (run 37908240844): a write, then the
// SAME bot's scan skipping the neighbor chests of the fresh doomed cell
// - the write-to-skip gaps 1..2 lines, the same-pass fingerprint.
const FACE139 = [
  'F13 [F13] no-path ledger: chest at [-120,72,382] cached for the fleet (1 live, ttl 15s)',
  'F13 [F13] chest skip (no path cached 0s ago at [-121,72,382])',
  'F18 [F18] no-path ledger: chest at [-119,72,382] cached for the fleet (2 live, ttl 15s)',
  'F18 [F18] chest skip (no path cached 0s ago at [-120,72,382])',
  'F18 [F18] chest skip (no path cached 0s ago at [-121,72,382])'
]

const echo = ledgerRecordBook(FACE139)
assert.equal(echo.records, 2, 'the two writes fold')
assert.equal(echo.saves, 3, 'the three same-pass skips fold')
const e = echo.families['no-path']
assert.deepEqual(e.parentCell, { sameCell: 0, neighbor: 3, orphan: 0 }, 'every skip bought by a NEIGHBOR write (d 1..2 - the yard rows pack tight)')
assert.deepEqual(e.parentBot, { same: 3, cross: 0 }, 'SAME-BOT 3 of 3 - the writer echoes its own write')
assert.deepEqual(e.passGap, { n: 3, min: 1, max: 2, avg: 1.3 }, 'the pass gaps 1..2 lines - the same-pass fingerprint')
assert.equal(e.leverage, 1.5, '3 skips on 2 writes')
assert.match(
  ledgerRecordBookRow(echo),
  /^the ledger families' own book \(v0\.869\.0\): no-path 2 record\(s\) on 2 chest\(s\) \(live 1\.\.2 avg 1\.5 - fresh 2 \/ escalated 0 \/ timeout 0\) bought 3 skip\(s\) \(bots 2 \(F18=2 F13=1\), age 0\.\.0s avg 0; parents same-cell 0 \/ neighbor 3 \/ orphan 0, same-bot 3 \/ cross-bot 0, pass gap 1\.\.2 lines avg 1\.3\) - leverage 1\.5 skips\/record - THE SELF-ECHO FACE: the skips ride the writer's own pass - the neighbors of a fresh write, not the fleet's second bot \(the cross-bot save waits for the half-life's window\)$/,
  'the face-139 self-echo row verbatim'
)

// ---- the cross-bot seat: the founding purpose works ----

const cache = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  'F16 [F16] chest skip (no path cached 2s ago at [-136,72,390])',
  'F2 [F2] chest skip (no path cached 4s ago at [-134,72,390])'
])
const cc = cache.families['no-path']
assert.deepEqual(cc.parentCell, { sameCell: 0, neighbor: 2, orphan: 0 }, 'both skips ride the same doomed cell\'s neighborhood')
assert.deepEqual(cc.parentBot, { same: 0, cross: 2 }, 'CROSS-BOT 2 of 2 - other bots spared the walk')
assert.match(
  ledgerRecordBookRow(cache),
  /- THE FLEET'S OWN CACHE: the cross-bot saves own the book - the founding purpose works \(the skip spared another bot the doomed walk\)$/,
  'the cross-bot seat'
)

// ---- the both-families fold: the writes join the saves ----

const BOTH = [
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  "F14 [F14] no-path ledger: chest at [-135,72,390] cached for the fleet (2 live, ttl 90s (the repeat's own half-life))",
  'F11 [F11] no-path ledger: chest at [-121,72,408] cached for the fleet (1 live, ttl 15s, timeout verdict)',
  'F2 [F2] full-chest ledger: chest at [-116,72,412] cached for the fleet (2 live, ttl 180s)',
  'F2 [F2] chest skip (no path cached 0s ago at [-116,72,412])',
  'F16 [F16] chest skip (no path cached 0s ago at [-136,72,400])',
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
assert.deepEqual(f.parentCell, { sameCell: 0, neighbor: 0, orphan: 2 }, 'the no-path writes sit outside the skips\' reach - orphans')
assert.deepEqual(f.parentBot, { same: 0, cross: 0 }, 'no parents - no bot split')
assert.equal(f.passGap, null, 'no parents - no pass gap')
assert.equal(f.leverage, 0.7, 'the family leverage 2/3 rounds to 0.7')
const fc = book.families['full-chest']
assert.equal(fc.records, 1, 'the full-chest write')
assert.equal(fc.fresh, 1, 'the full-chest write rides fresh (no escalation - chests do not empty mid-run)')
assert.equal(fc.escalated, 0, 'no escalation in the full-chest family')
assert.deepEqual(fc.live, { n: 1, min: 2, max: 2, avg: 2 }, 'the full-chest live occupancy')
assert.equal(fc.saves, 1, 'the full-chest save')
assert.deepEqual(fc.saveAge, { n: 1, min: 45, max: 45, avg: 45 }, 'the 45s full-cache age')
assert.deepEqual(fc.parentCell, { sameCell: 0, neighbor: 0, orphan: 1 }, 'the full-chest skip rides outside its write\'s tight reach (dz 6 > dy 2)')
assert.equal(fc.leverage, 1, 'one write bought one save')
assert.match(
  ledgerRecordBookRow(book),
  /no-path 3 record\(s\) on 2 chest\(s\) \(repeats 1\) \(live 1\.\.2 avg 1\.3 - fresh 2 \/ escalated 1 \/ timeout 1\) bought 2 skip\(s\) \(bots 2 \(F16=1 F2=1\), age 0\.\.0s avg 0; parents same-cell 0 \/ neighbor 0 \/ orphan 2\) - leverage 0\.7 skips\/record; full-chest 1 record\(s\) on 1 chest\(s\) \(live 2\.\.2 avg 2 - fresh 1 \/ escalated 0 \/ timeout 0\) bought 1 skip\(s\) \(bots 1 \(F5=1\), age 45\.\.45s avg 45; parents same-cell 0 \/ neighbor 0 \/ orphan 1\) - leverage 1 skips\/record/,
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

// The rent seat: the skips out-run the paid failures (the skips ride
// outside the write's reach - the orphans keep the seat honest).
const rent = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  'F2 [F2] chest skip (no path cached 0s ago at [-100,72,390])',
  'F16 [F16] chest skip (no path cached 0s ago at [-100,72,391])'
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

// The tie law: saves trail the records, no escalation, no parent seat.
assert.match(
  ledgerRecordBookRow(book),
  /- THE LEDGER'S OWN TIE: the skips trail the paid failures - the leverage waits$/,
  'the tie law'
)

// The seat priority: the escalation majority outranks the self-echo.
const escEcho = ledgerRecordBook([
  "F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 90s (the repeat's own half-life))",
  'F4 [F4] chest skip (no path cached 0s ago at [-135,72,390])'
])
assert.match(
  ledgerRecordBookRow(escEcho),
  /- THE HALF-LIFE'S OWN FACE:/,
  'the escalation outranks the parent seats'
)

// A silent family never rides the row: the full-chest leg stays home.
assert.doesNotMatch(ledgerRecordBookRow(rent), /full-chest/, 'the silent family stays off the row')
assert.match(ledgerRecordBookRow(rent), /^the ledger families' own book \(v0\.869\.0\): no-path /, 'the row opens with the speaking family')

// ---- the parent join's own edges: the radius and the dy ----

// The no-path consult rides NOPATH_RADIUS = 4 / NOPATH_DY = 4 (the
// one-ruler law: the lens imports the REAL constants). d=4 within,
// d=5 out; dy=4 within, dy=5 out.
const edges = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [0,64,0] cached for the fleet (1 live, ttl 15s)',
  'F2 [F2] chest skip (no path cached 0s ago at [4,64,0])',
  'F16 [F16] chest skip (no path cached 0s ago at [0,68,0])',
  'F5 [F5] chest skip (no path cached 0s ago at [5,64,0])',
  'F6 [F6] chest skip (no path cached 0s ago at [0,69,0])'
])
const ed = edges.families['no-path']
assert.deepEqual(ed.parentCell, { sameCell: 0, neighbor: 2, orphan: 2 }, 'd=4 and dy=4 ride inside, d=5 and dy=5 fall out')
assert.deepEqual(ed.parentBot, { same: 0, cross: 2 }, 'the two parented edge saves ride other bots (every bot distinct here)')

// The same-cell join: the parent wrote the skipped chest itself.
const sameCell = ledgerRecordBook([
  'F4 [F4] no-path ledger: chest at [-135,72,390] cached for the fleet (1 live, ttl 15s)',
  'F4 [F4] chest skip (no path cached 1s ago at [-135,72,390])'
])
const sc = sameCell.families['no-path']
assert.deepEqual(sc.parentCell, { sameCell: 1, neighbor: 0, orphan: 0 }, 'the same-cell join')
assert.deepEqual(sc.parentBot, { same: 1, cross: 0 }, 'the same bot re-read its own write')

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
assert.equal(ledgerRecordBook(['F4 [F4] no-path ledger: chest at [x,y,z] cached for the fleet (1 live, ttl 15s)']), null, 'a junk position is not a write')
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
assert.equal(mixed.families['no-path'].parentCell.orphan, 1, 'the save rides outside the write\'s reach - the honest orphan')

// ---- the fence battery: a self-inconsistent book never renders ----

const good = ledgerRecordBook(BOTH)
assert.equal(ledgerRecordBookConsistent(good), true, 'the both-families book is consistent')
assert.equal(ledgerRecordBookConsistent(blind), true, 'the blind book is consistent too (the zero legs close)')
assert.equal(ledgerRecordBookConsistent(echo), true, 'the self-echo book is consistent')
const clone = (over) => ({ ...JSON.parse(JSON.stringify(good)), ...over })
const famClone = (fam, over) => {
  const b = JSON.parse(JSON.stringify(good))
  b.families[fam] = { ...b.families[fam], ...over }
  return b
}
assert.equal(ledgerRecordBookConsistent(clone({ records: 2 })), false, 'the totals records break')
assert.equal(ledgerRecordBookConsistent(clone({ saves: 9 })), false, 'the totals saves break')
assert.equal(ledgerRecordBookConsistent(clone({ leverage: 9.9 })), false, 'the totals leverage break')
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
// the v0.869.0 parent fences
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { parentCell: { sameCell: 1, neighbor: 0, orphan: 2 } })), false, 'the parent cell split break')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { parentBot: { same: 1, cross: 0 } })), false, 'the parent bot split break (2 parented)')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { passGap: { n: 1, min: 2, max: 2, avg: 2 } })), false, 'the pass gap n break (2 parented)')
assert.equal(ledgerRecordBookConsistent(famClone('no-path', { passGap: { n: 2, min: 0, max: 2, avg: 1 } })), false, 'the pass gap min < 1 break (a gap is >= 1 line)')
const orphanBreak = JSON.parse(JSON.stringify(echo))
orphanBreak.families['no-path'].parentCell.orphan = 1
orphanBreak.families['no-path'].parentCell.neighbor = 3
assert.equal(ledgerRecordBookConsistent(orphanBreak), false, 'the orphan break (the parent bot split no longer closes)')
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
assert.match(lib, /the ledger families' own book \(v0\.869\.0\)/, "the row's own byte lives in the lib")
assert.match(lib, /NOPATH_RADIUS, NOPATH_DY } from '\.\/nopath\.mjs'/, 'the no-path reach rides the REAL constants (the one-ruler law)')

console.log('ledgerbook.test.mjs: all green')

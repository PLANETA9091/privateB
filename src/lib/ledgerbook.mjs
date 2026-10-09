// (v0.867.0) THE LEDGER FAMILIES' OWN BOOK - the fleet ledger's own
// economy fold. The motive: the no-path ledger's record byte ('no-path
// ledger: chest at [...] cached for the fleet (N live, ttl 15s|90s...)')
// has been FILTER-INVISIBLE since v0.62.0 - face 138 priced 18 'No path'
// hop refusals and 65 'chest skip (no path cached ...)' saves while the
// writes rode NOWHERE, and the v0.863.0 half-life's own escalation byte
// ('ttl 90s (the repeat's own half-life)') was unverifiable in the
// field. The v0.866.0 un-blinding joined the LEDGER FAMILIES to the
// fleet log filter - the first face that carries the writes can now
// price the ledger's own economy: WHICH chest paid the write, how many
// skips the cache bought back, and how often the repeat's own half-life
// rides.
//
// The fold reads TWO families, each with its write (the record byte)
// and its save (the skip byte the log always carried):
//   - the no-path family: the v0.62.0 fleet no-path ledger - the write
//     'no-path ledger: chest at [x,y,z] cached for the fleet (N live,
//     ttl 15s|90s (the repeat's own half-life)[, timeout verdict])',
//     the save 'chest skip (no path cached Xs ago at [x,y,z])'. The
//     ttl split is the half-life's own read: fresh (15s, the machine
//     ttl) vs escalated (90s, the v0.863.0 repeat's own half-life - a
//     cell whose prior verdict expired and that refused AGAIN); the
//     timeout suffix counts the v0.70.0 weak-evidence shape.
//   - the full-chest family: the v0.65.0 full-chest ledger - the write
//     'full-chest ledger: chest at [x,y,z] cached for the fleet (N
//     live, ttl 180s)' (FULL_CHEST_TTL_MS, no escalation - chests do
//     not empty mid-run), the save 'chest skip (full cached Xs ago at
//     [x,y,z])'.
// The out-of-scope families stay out: the doomed-goal skip (the
// jobqueue's own doomedGoals ledger - its write never printed) and the
// vertical-doom skip (the v0.188.0 arithmetic gate - no ledger at all)
// judge nothing here; the end-phase census line ('no-path ledger: N
// live verdict(s) at end phase') names no chest - not a write.
//
// The leverage: saves / records per family (the skips one write buys) -
// the ledger's own rent arithmetic. The book's totals fold both
// families; the seat law ranks the escalation majority first (the
// half-life's verification is the lens's motive), then the rent
// (saves >= records), then the blind-records read (saves with no
// writes - the pre-v0.866.0 faces), the waiting cache (records with no
// saves), else the tie law honestly.
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only).

const NOPATH_RECORD_RE = /^(F\d+) \[F\d+\] no-path ledger: chest at \[(-?\d+),(-?\d+),(-?\d+)\] cached for the fleet \((\d+) live, ttl (15s|90s \(the repeat's own half-life\))(, timeout verdict)?\)$/
const FULLCHEST_RECORD_RE = /^(F\d+) \[F\d+\] full-chest ledger: chest at \[(-?\d+),(-?\d+),(-?\d+)\] cached for the fleet \((\d+) live, ttl (\d+)s\)$/
const NOPATH_SKIP_RE = /^(F\d+) \[F\d+\] chest skip \(no path cached (\d+)s ago at \[(-?\d+),(-?\d+),(-?\d+)\]\)$/
const FULLCHEST_SKIP_RE = /^(F\d+) \[F\d+\] chest skip \(full cached (\d+)s ago at \[(-?\d+),(-?\d+),(-?\d+)\]\)$/

const mkStats = (list) => list.length === 0
  ? null
  : {
      n: list.length,
      min: Math.min(...list),
      max: Math.max(...list),
      avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
    }

const ratio = (a, b) => b === 0 ? null : Math.round((a / b) * 10) / 10

const EMPTY_FAMILY = () => ({
  records: 0,
  chests: {},
  distinctChests: 0,
  repeatChests: [],
  live: null,
  fresh: 0,
  escalated: 0,
  timeout: 0,
  saves: 0,
  saveBots: {},
  saveAge: null,
  leverage: null
})

function foldFamily (lines, recordRe, skipRe, { escalatable }) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return EMPTY_FAMILY()
  const fam = EMPTY_FAMILY()
  const lives = []
  const ages = []
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const rec = l.match(recordRe)
    if (rec) {
      const bot = rec[1]
      const pos = `${rec[2]},${rec[3]},${rec[4]}`
      const live = Number(rec[5])
      fam.records++
      if (!fam.chests[pos]) fam.chests[pos] = { n: 0, bots: {} }
      const c = fam.chests[pos]
      c.n++
      c.bots[bot] = (c.bots[bot] || 0) + 1
      if (Number.isFinite(live) && live >= 0) lives.push(live)
      if (escalatable) {
        if (rec[6].startsWith('90s')) fam.escalated++
        else fam.fresh++
        if (rec[7]) fam.timeout++
      } else {
        fam.fresh++
      }
      continue
    }
    const skip = l.match(skipRe)
    if (skip) {
      const bot = skip[1]
      const age = Number(skip[2])
      fam.saves++
      fam.saveBots[bot] = (fam.saveBots[bot] || 0) + 1
      if (Number.isFinite(age) && age >= 0) ages.push(age)
    }
  }
  fam.distinctChests = Object.keys(fam.chests).length
  fam.repeatChests = Object.entries(fam.chests)
    .filter(([, c]) => c.n >= 2)
    .map(([pos, c]) => ({ pos, n: c.n, bots: { ...c.bots } }))
    .sort((a, b) => b.n - a.n ||
      Object.keys(b.bots).length - Object.keys(a.bots).length ||
      a.pos.localeCompare(b.pos))
  fam.live = mkStats(lives)
  fam.saveAge = mkStats(ages)
  fam.leverage = ratio(fam.saves, fam.records)
  return fam
}

/** The fold: both ledger families' writes and saves from the face's
 * own log lines. Returns null when NEITHER family rode the face (no
 * records, no saves) - the honest silence; a family with only one leg
 * (saves without records - the pre-v0.866.0 faces, or records without
 * saves - the waiting cache) folds honestly with the zero leg. */
export function ledgerRecordBook (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  const noPath = foldFamily(rows, NOPATH_RECORD_RE, NOPATH_SKIP_RE, { escalatable: true })
  const fullChest = foldFamily(rows, FULLCHEST_RECORD_RE, FULLCHEST_SKIP_RE, { escalatable: false })
  if (noPath.records + noPath.saves + fullChest.records + fullChest.saves === 0) return null
  const records = noPath.records + fullChest.records
  const saves = noPath.saves + fullChest.saves
  return {
    families: { 'no-path': noPath, 'full-chest': fullChest },
    records,
    saves,
    leverage: ratio(saves, records)
  }
}

/** THE CONSISTENCY FENCE (the v0.852.0 fence law): both families carry
 * their legs' own sums - the ttl split closes (fresh + escalated ===
 * records), the timeout cannot out-run the records, the live stats obey
 * min <= avg <= max with n === records (null iff records === 0), the
 * chests' n sum to the records with the repeats' own shape (n >= 2 and
 * a matching chest entry), the save bots' sum closes, the save ages obey
 * min <= avg <= max with n === saves (null iff saves === 0), the
 * leverage re-rounds to the same tenth. A self-inconsistent book never
 * renders. */
export function ledgerRecordBookConsistent (book) {
  if (!book || typeof book !== 'object') return false
  const fams = book.families
  if (!fams || typeof fams !== 'object') return false
  if (Object.keys(fams).sort().join(',') !== 'full-chest,no-path') return false
  if (!fams['no-path'] || !fams['full-chest']) return false
  let records = 0
  let saves = 0
  for (const [name, fam] of Object.entries(fams)) {
    if (!fam || typeof fam !== 'object') return false
    if (!Number.isFinite(fam.records) || fam.records < 0) return false
    if (!Number.isFinite(fam.saves) || fam.saves < 0) return false
    if (!Number.isFinite(fam.fresh) || fam.fresh < 0) return false
    if (!Number.isFinite(fam.escalated) || fam.escalated < 0) return false
    if (!Number.isFinite(fam.timeout) || fam.timeout < 0) return false
    if (fam.fresh + fam.escalated !== fam.records) return false
    if (fam.timeout > fam.records) return false
    if ((fam.live === null) !== (fam.records === 0)) return false
    if (fam.live) {
      if (fam.live.n !== fam.records) return false
      if (!Number.isFinite(fam.live.min) || !Number.isFinite(fam.live.max) ||
        !Number.isFinite(fam.live.avg)) return false
      if (fam.live.min > fam.live.avg || fam.live.avg > fam.live.max) return false
    }
    let chestSum = 0
    for (const c of Object.values(fam.chests || {})) {
      if (!Number.isFinite(c.n) || c.n < 1) return false
      const botsSum = Object.values(c.bots || {}).reduce((a, b) => a + b, 0)
      if (botsSum !== c.n) return false
      chestSum += c.n
    }
    if (chestSum !== fam.records) return false
    if (Object.keys(fam.chests || {}).length !== fam.distinctChests) return false
    for (const r of fam.repeatChests || []) {
      if (!Number.isFinite(r.n) || r.n < 2) return false
      const src = fam.chests[r.pos]
      if (!src || src.n !== r.n) return false
    }
    if (name === 'full-chest' && fam.escalated !== 0) return false
    const botsSum = Object.values(fam.saveBots || {}).reduce((a, b) => a + b, 0)
    if (botsSum !== fam.saves) return false
    if ((fam.saveAge === null) !== (fam.saves === 0)) return false
    if (fam.saveAge) {
      if (fam.saveAge.n !== fam.saves) return false
      if (!Number.isFinite(fam.saveAge.min) || !Number.isFinite(fam.saveAge.max) ||
        !Number.isFinite(fam.saveAge.avg)) return false
      if (fam.saveAge.min > fam.saveAge.avg || fam.saveAge.avg > fam.saveAge.max) return false
    }
    if (fam.leverage !== ratio(fam.saves, fam.records)) return false
    records += fam.records
    saves += fam.saves
  }
  if (book.records !== records || book.saves !== saves) return false
  return book.leverage === ratio(saves, records)
}

/** The row: 'the ledger families' own book (v0.867.0): no-path 12
 * record(s) on 7 chest(s) (live 1..8 avg 3.4 - fresh 9 / escalated 3 /
 * timeout 2) bought 25 skip(s) (bots 6 (F1=7 ...), age 0..16s avg 1.2)
 * - leverage 2.1 skips/record; full-chest ... - THE LEDGER PAYS ITS
 * RENT: ...'. A silent family never rides the row; the seat law ranks
 * the escalation majority first, then the rent, the blind records, the
 * waiting cache, else the tie law. */
export function ledgerRecordBookRow (book) {
  if (!ledgerRecordBookConsistent(book)) return null
  const cells = []
  for (const [name, label] of [['no-path', 'no-path'], ['full-chest', 'full-chest']]) {
    const fam = book.families[name]
    if (fam.records === 0 && fam.saves === 0) continue
    let cell
    if (fam.records > 0) {
      const liveCell = fam.records > 0
        ? ` (live ${fam.live.min}..${fam.live.max} avg ${fam.live.avg} - fresh ${fam.fresh} / escalated ${fam.escalated} / timeout ${fam.timeout})`
        : ''
      const repeatCell = fam.repeatChests.length > 0 ? ` (repeats ${fam.repeatChests.length})` : ''
      const botEntries = Object.entries(fam.saveBots).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      const saveCell = fam.saves > 0
        ? ` bought ${fam.saves} skip(s) (bots ${botEntries.length} (${botEntries.map(([k, c]) => `${k}=${c}`).join(' ')}), age ${fam.saveAge.min}..${fam.saveAge.max}s avg ${fam.saveAge.avg}) - leverage ${fam.leverage} skips/record`
        : ' bought 0 skip(s)'
      cell = `${label} ${fam.records} record(s) on ${fam.distinctChests} chest(s)${repeatCell}${liveCell}${saveCell}`
    } else {
      const botEntries = Object.entries(fam.saveBots).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      cell = `${label} 0 record(s) bought ${fam.saves} skip(s) (bots ${botEntries.length} (${botEntries.map(([k, c]) => `${k}=${c}`).join(' ')}), age ${fam.saveAge.min}..${fam.saveAge.max}s avg ${fam.saveAge.avg}) - the writes rode blind`
    }
    cells.push(cell)
  }
  if (cells.length === 0) return null
  const head = `the ledger families' own book (v0.867.0): ${cells.join('; ')}`
  const np = book.families['no-path']
  let seat
  if (book.records > 0 && np.escalated > book.families['no-path'].records / 2) seat = "- THE HALF-LIFE'S OWN FACE: the repeats own the writes - the 90s window rides live (the v0.863.0 cure confirmed in the field)"
  else if (book.records > 0 && book.saves >= book.records) seat = '- THE LEDGER PAYS ITS RENT: the skips out-run the paid failures - the fleet-wide cache earns its keep'
  else if (book.records === 0 && book.saves > 0) seat = '- THE RECORDS RODE BLIND: the log carried the skips but never the writes - the v0.866.0 un-blinding reads them from the next face'
  else if (book.records > 0 && book.saves === 0) seat = "- THE LEDGER WAITS: the records stand but no hop rode them - the cache's economy waits for its first skip"
  else seat = "- THE LEDGER'S OWN TIE: the skips trail the paid failures - the leverage waits"
  return `${head} ${seat}`
}

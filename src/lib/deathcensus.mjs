/**
 * deathcensus.mjs - (v0.656.0) THE DEATH'S OWN CENSUS - the report's own read
 * of the death mass, pure.
 *
 * MEASURED (fleet 37256535767, the v0.655.0 face, the calm-air one): 33 deaths
 * - Drowned x26 (78.8%), Zombie x3, Skeleton x2, Creeper x1, fall x1 - and the
 * report had NO row for the mass: the face's #1 conversion killer (the deaths
 * dropped the fleet's carried loot, unaccounted read 683u and conversion fell
 * 103.5% -> 65.8% between two calm-air faces) was a per-face LOG DIVE - the
 * 'died - respawning' lines flowed through the fleet log past every report
 * row, and each fire re-mined the grain by hand (the fire-0739 hand count:
 * 'Zombie x6, Skeleton x4, Drowned x2, drown x1'). The census gives the death
 * mass the write-off family's own seat: the death lines are ALREADY in the
 * fleet log (the 'died' filter key), the server verdict already names the
 * killer (deathcause.mjs's structured 'server: ... [kind=...] |' shape rides
 * every announce since v0.117.0) - the row reads them at the report and the
 * next face prices its killer by name, no dive.
 *
 * THE LAWS THIS ROW OBEYS:
 *   - the server verdict is the authority (the v0.117.0 doctrine): the grain
 *     buckets on the [kind=...] field the server line carries; an attacker
 *     name (kind=mob by Drowned) IS the grain - the generic 'mob' kind alone
 *     is the bucket only when the server named no attacker.
 *   - junk never invents (the census law): a line that does not announce a
 *     death reads null; an announce without a parseable kind still counts -
 *     as 'unknown' (a death is a death; the mass never loses a body to a
 *     prose drift - the v0.583.0 law).
 *   - a death line is NOT a death-drop line: the 'death drop' snapshot lines
 *     ride the same 'died' filter band and never match the announce shape.
 *   - the healthy silence: zero deaths reads no row (the none-form is a
 *     verdict too - the 05:00 ledger-skip lesson prints it only when the
 *     caller asks; this row prints nothing on an empty mass, the calm face's
 *     own silence).
 *   - the sort law (counts desc, name asc - the family's tie law) and the
 *     share floor for the own-mass tail (the top bucket must own at least
 *     OWN_SHARE of a mass of at least MIN_OWN_MASS deaths - one death owning
 *     its own mass of one says nothing).
 */

/** The death announce line's shape (the fleet log's composed form: the bot
 *  name, the bracketed tag, the verb - deathdropcensus.mjs's own grain). */
export const DEATH_CENSUS_LINE_RE = /^\S+ \[\S+\] died - respawning/

/** The server verdict's kind field: '[kind=mob by Drowned]', '[kind=fall]',
 *  '[kind=drown]', '[kind=explosion by Creeper]'. The attacker name is the
 *  grain for every kind that carries one. */
const KIND_RE = /\[kind=([a-z ]+?)(?: by ([A-Za-z]+))?\]/

/** The bot name at the line's head ('F10 [F10] died ...' -> 'F10'). */
const BOT_RE = /^(\S+) \[/

/**
 * (v0.656.0) THE DEATH RECORD - parse one fleet-log death announce line,
 * junk-safe. A non-announce line reads null (never invents); an announce
 * without a parseable kind reads the honest 'unknown' bucket (the mass never
 * loses a body).
 * @param {string} [line] the composed fleet-log line
 * @returns {{bot: string, kind: string, killer: string|null}|null}
 */
export function deathCensusRecord (line) {
  if (typeof line !== 'string' || !DEATH_CENSUS_LINE_RE.test(line)) return null
  const botMatch = BOT_RE.exec(line)
  const kindMatch = KIND_RE.exec(line)
  const kind = kindMatch ? kindMatch[1].trim() : 'unknown'
  const killer = kindMatch && kindMatch[2] ? kindMatch[2] : null
  return { bot: botMatch ? botMatch[1] : 'unknown', kind, killer }
}

/** The bucket name: the killer when the server named one, else the kind
 *  (the generic 'mob' kind alone never swallows the row - it IS a bucket). */
export function deathBucket (rec) {
  if (!rec || typeof rec !== 'object') return 'unknown'
  const killer = typeof rec.killer === 'string' && rec.killer ? rec.killer : null
  const kind = typeof rec.kind === 'string' && rec.kind ? rec.kind : 'unknown'
  return killer || kind
}

/** The own-mass tail's share floor: the top bucket must own at least this
 *  share of the mass before the row names the owner. */
export const DEATH_CENSUS_OWN_SHARE = 0.5

/** The own-mass tail's mass floor: a mass below this never names an owner
 *  (one death owning its own mass of one says nothing). */
export const DEATH_CENSUS_MIN_OWN_MASS = 4

/**
 * (v0.656.0) THE DEATH CENSUS ROW - the fleet's death mass, by killer, pure.
 * 'death census: 33 deaths - Drowned x26 (78.8%), Zombie x3, Skeleton x2,
 * Creeper x1, fall x1 - Drowned owns the mass'. Junk-safe: an empty or
 * unreadable mass reads null (the healthy silence - the calm face's own
 * form); the counts sort desc, the names break ties asc (the family's law);
 * the own-mass tail prints only above both floors.
 * @param {Array<{bot?: string, kind?: string, killer?: string|null>|any>} [records]
 * @param {object} [o]
 * @param {number} [o.ownShare] the tail's share floor (default DEATH_CENSUS_OWN_SHARE)
 * @param {number} [o.minOwnMass] the tail's mass floor (default DEATH_CENSUS_MIN_OWN_MASS)
 * @returns {string|null}
 */
export function deathCensusRow (records, { ownShare = DEATH_CENSUS_OWN_SHARE, minOwnMass = DEATH_CENSUS_MIN_OWN_MASS } = {}) {
  if (!Array.isArray(records) || records.length === 0) return null
  const acc = new Map()
  for (const rec of (Array.isArray(records) ? records : [])) {
    try {
      const bucket = deathBucket(rec)
      acc.set(bucket, (acc.get(bucket) || 0) + 1)
    } catch { /* a torn record holds nothing this read */ }
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const good = [...acc].map(([name, deaths]) => ({ name, deaths }))
  good.sort((a, b) => (b.deaths - a.deaths) || (a.name < b.name ? -1 : 1))
  const top = good[0]
  const parts = good
    .map((g, i) => i === 0
      ? `${g.name} x${g.deaths} (${((g.deaths / total) * 100).toFixed(1)}%)` // the family's own share shape - the top bucket's share rides its count (the write-off whys row's form), the rest speak in counts
      : `${g.name} x${g.deaths}`)
    .join(', ')
  const tail = (top.deaths / total >= ownShare && total >= minOwnMass)
    ? ` - ${top.name} owns the mass`
    : ''
  return `death census: ${total} death${total === 1 ? '' : 's'} - ${parts}${tail}`
}

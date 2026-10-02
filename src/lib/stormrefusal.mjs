// (v0.478.0) THE STORM LEDGER - the craft storm's transient/terminal
// split. THE QUESTION (three handoffs' standing item - fire 1638 pt3, fire
// 1738 pt3, fire 1800 pt1): the tools.mjs craft storm is the craft lane's
// own brake (at CRAFT_STORM_GIVE_UP consecutive fence timeouts the lane
// refuses every craft until the cooldown elapses; face 43's F13 rode it -
// the storm class behind the words-verdict join's wordedNotOk). Is the
// brake TRANSIENT (a later craft lands - the storm released) or TERMINAL
// (the verdict reads failed - the give-up held)? The refusal lines alone
// cannot answer that; the verdict lines hold the answer.
//
// THE LENS (append-only, zero fleet changes, one parser per shape): the
// refusals come through parseStormCooldown (memhb.mjs - the shape's owner,
// now three-skin aware), the verdicts through VERDICT_RE (upgradecensus.mjs
// - the v0.474.0 join's import law). Per bot, in file order, the refusals
// cluster into EPISODES: a maximal run of refusals with no verdict of that
// bot between (a verdict - ANY verdict - splits the episode: the craft
// lane surfaced between the refusals, so the storm's state was re-read).
// Each episode resolves by the bot's NEXT verdict at or after its last
// refusal:
//   ok         -> RECOVERED  (a craft landed after the brake - the storm
//                            released; the transient class)
//   failed     -> TERMINAL   (the lane's verdict read failed - the give-up
//                            held for that attempt; the storm may still
//                            release later - face 43 shows both)
//   commune    -> COMMUNE    (the commune lane's own verdict resolved it)
//   none       -> UNANSWERED (no verdict ever followed - the face ended
//                            inside the window, or the release left no
//                            verdict shape - the lens's named blind spot:
//                            a non-upgrade craft's success resets the
//                            storm silently, this class holds BOTH)
//
// THE HONEST SCOPE: the episode's class is the STORM's resolution (did the
// bot's craft lane surface a verdict later), never the refused ITEM's own
// fate - the spare-pick and sword lanes speak their own shapes ('spare
// pick: craft did not land'), those voices belong to their own emitters
// and are not joined here. Face 43's F13 read all three main classes on
// one bot: episode A terminal (the upgrade verdict failed -> none), episode
// B recovered (the OK -> stone_pickaxe verdict 300+ lines later), episode C
// unanswered (the oak_planks refusal, then the face's tail).
//
// Pure parser, unit-pinned (the sealcensus v0.397.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines. Junk-safe end to end: non-string rows skipped, a face with no
// refusals reads the honest zero (the calm-face verdict is itself the
// read - the storm never engaged).

import { parseStormCooldown } from './memhb.mjs'
import { VERDICT_RE } from './upgradecensus.mjs'

const num = (s) => Number(s)

/**
 * The storm ledger over a whole face log (pure; the decompose field read).
 * Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {null|{refusals: number, refusalBots: string[], byItem: Object<string,number>,
 *   skins: {tagged: number, upgrade: number, plain: number, other: number},
 *   episodes: number, byClass: {recovered: number, terminal: number, commune: number, unanswered: number},
 *   recoveredBots: string[], terminalBots: string[], unansweredBots: string[],
 *   maxWaitMs: number|null, maxConsecutive: number|null,
 *   rows: Array<{bot: string, items: string[], refusals: number, maxWaitMs: number, maxConsecutive: number, class: string}>}}
 */
export function stormRefusalLedger (lines) {
  if (typeof lines === 'string') return stormRefusalLedger(lines.split('\n'))
  if (!Array.isArray(lines)) return null
  const rows = lines

  // One pass: every refusal and every verdict, in file order.
  const refusals = []
  const verdicts = []
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]
    if (typeof line !== 'string') continue
    const r = parseStormCooldown(line)
    if (r) {
      refusals.push({ idx: i, bot: r.bot, item: r.item, waitMs: r.waitMs, consecutive: r.consecutive, skin: r.skin })
      continue
    }
    const v = VERDICT_RE.exec(line)
    if (v) {
      const isCommune = /tool upgrade \(commune\):/i.test(line)
      verdicts.push({ idx: i, bot: v[1], kind: isCommune ? 'commune' : (v[2].toLowerCase() === 'failed' ? 'failed' : 'ok') })
    }
  }

  const byItem = {}
  const skins = { tagged: 0, upgrade: 0, plain: 0, other: 0 }
  let maxWaitMs = null
  let maxConsecutive = null
  for (const r of refusals) {
    byItem[r.item] = (byItem[r.item] || 0) + 1
    skins[r.skin] = (skins[r.skin] || 0) + 1
    if (maxWaitMs === null || r.waitMs > maxWaitMs) maxWaitMs = r.waitMs
    if (maxConsecutive === null || r.consecutive > maxConsecutive) maxConsecutive = r.consecutive
  }

  // Episodes: per bot, a maximal run of refusals with no verdict of that
  // bot between. The verdict scan is per-bot and line-ordered - a verdict
  // of ANOTHER bot never splits an episode.
  const byBot = {}
  for (const r of refusals) (byBot[r.bot] = byBot[r.bot] || []).push(r)
  const verdictIdx = {}
  for (const v of verdicts) (verdictIdx[v.bot] = verdictIdx[v.bot] || []).push(v)

  const episodeRows = []
  const byClass = { recovered: 0, terminal: 0, commune: 0, unanswered: 0 }
  const recoveredBots = []
  const terminalBots = []
  const unansweredBots = []
  for (const bot of Object.keys(byBot)) {
    const mine = byBot[bot]
    const myVerdicts = verdictIdx[bot] || []
    let vi = 0 // myVerdicts cursor: verdicts before the current refusal are consumed
    let ep = null
    const flush = () => {
      if (!ep) return
      // The episode's resolution: my next verdict at or after the last
      // refusal's index. The verdict's kind maps to the episode's class
      // (ok -> recovered, failed -> terminal, commune -> commune).
      let cls = 'unanswered'
      for (let j = vi; j < myVerdicts.length; j++) {
        if (myVerdicts[j].idx >= ep.lastIdx) {
          cls = myVerdicts[j].kind === 'ok' ? 'recovered' : (myVerdicts[j].kind === 'failed' ? 'terminal' : 'commune')
          vi = j + 1
          break
        }
      }
      const row = {
        bot: ep.bot,
        items: ep.items.slice(),
        refusals: ep.refusals,
        maxWaitMs: ep.maxWaitMs,
        maxConsecutive: ep.maxConsecutive,
        class: cls
      }
      episodeRows.push(row)
      byClass[cls] = byClass[cls] + 1
      if (cls === 'recovered' && !recoveredBots.includes(bot)) recoveredBots.push(bot)
      if (cls === 'terminal' && !terminalBots.includes(bot)) terminalBots.push(bot)
      if (cls === 'unanswered' && !unansweredBots.includes(bot)) unansweredBots.push(bot)
      ep = null
    }
    for (const r of mine) {
      // Consume verdicts that landed before this refusal (episode splitters
      // already flushed; these are just ordering bookkeeping).
      while (vi < myVerdicts.length && myVerdicts[vi].idx < r.idx) {
        // A verdict between refusals splits the episode: flush what pends.
        if (ep) { flush(); break }
        vi++
      }
      if (!ep) {
        ep = { bot, items: [r.item], refusals: 1, maxWaitMs: r.waitMs, maxConsecutive: r.consecutive, lastIdx: r.idx }
      } else {
        if (!ep.items.includes(r.item)) ep.items.push(r.item)
        ep.refusals++
        if (r.waitMs > ep.maxWaitMs) ep.maxWaitMs = r.waitMs
        if (r.consecutive > ep.maxConsecutive) ep.maxConsecutive = r.consecutive
        ep.lastIdx = r.idx
      }
    }
    flush()
  }

  return {
    refusals: refusals.length,
    refusalBots: Object.keys(byBot),
    byItem,
    skins,
    episodes: episodeRows.length,
    byClass,
    recoveredBots,
    terminalBots,
    unansweredBots,
    maxWaitMs,
    maxConsecutive,
    rows: episodeRows
  }
}

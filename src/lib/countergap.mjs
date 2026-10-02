// (v0.469.0) THE COUNTER-WORDS GAP - the window fire-1330 opened with the
// face-42 read: the pulse counter's tally said 'upgraded=14' while the
// upgrade census counted 12 event lines. WHERE does the counter's surplus
// live? THE CODE-READ (the two call sites in testbed/fleet19.mjs both do
// 'if (up.ok) toolsUpgraded++' around ONE flow - src/lib/toolupgrade.mjs
// upgradeTools - which has TWO exits):
//   the delegated rung (check.target stone_pickaxe, not worn) routes into
//   src/bots/tools.mjs upgradeTools, whose step prefix is '[upgrade]' and
//   whose LAST line is always '[toolupgrade] [upgrade] upgraded: <kit>' -
//   the words the census counts (UPGRADE_RE), ok or not;
//   the LOCAL path (the iron tier raise, the worn replacement) crafts in
//   toolupgrade.mjs itself and prints '[toolupgrade] <target>: crafted'
//   (or 'FAILED (phantom or missing mats)') as its verdict - and NEVER the
//   'upgraded:' words. The counter increments on BOTH paths; the words
//   land on ONE. The gap is therefore a POSITIONAL join of three line
//   shapes, not a guess.
// THE CONVERGENCE (SLOT COLLISION #5, the same hour): the parallel lane's
// v0.468.0 verdict census named the worn class LIVE from the policy flow's
// verdict lines (face 42: 14 = tier 12 + worn 2) while this lens was being
// built from the same code-read - the two rows co-exist in the decompose
// and cross-validate: the verdict census reads the PATHS, this lens joins
// the TALLY and closes the book (the residual = the unnamed remainder).
// THE LENS: one walk over the lines. It owns the tally line (the face's
// final 'bots=19 spawned=19 ... upgraded=N ...' console line - UNOWNED
// until now; the last tally in the log governs, tallyLines reports the
// count) and joins it against the census's own UPGRADE_RE (imported - no
// new words shape claimed), the local path's tool-name verdicts
// ('[toolupgrade] stone_pickaxe: crafted|FAILED' - pinned to the tool
// families so the intermediate 'sticks: crafted' / 'spare table: crafted'
// steps never masquerade as verdicts) and the delegated path's exception
// words ('[upgrade] failed: ...' - the words that replace the tally's
// expectation). gap = tally - words; the two named windows subtract;
// what remains is the honest residual (the completed-but-empty words, the
// catch edge - the lines do not name it, the row does not guess).
// Junk-safe: non-lines skipped, non-array -> null. Pure: reads, never
// mutates.
import { UPGRADE_RE } from './upgradecensus.mjs'

export const TALLY_RE = /^bots=\d+ .*\bupgraded=(\d+)\b/

// the local path's verdict: a TOOL name (the tool families only - the
// bracketed '[upgrade]' inner prefix can never match [a-z_]+ names, and
// 'sticks' / 'spare table' are pinned out), then the verdict word. The
// verdict 'crafted' is EXACTLY the counter's increment condition (ok &&
// rose); 'FAILED' is the no-count exit.
export const PATHB_VERDICT_RE = /^(F\d+) \[toolupgrade\] ((?:stone|iron|wooden|golden|diamond|netherite)_(?:pickaxe|shovel|sword)): (crafted|FAILED)\b/i

// the delegated path's exception words: the catch branch prints 'failed:'
// INSTEAD of the 'upgraded:' line - a rung pass the counter may or may not
// have counted (the catch returns ok = hasStonePickaxe) but whose words
// the census never saw.
export const PATHA_FAIL_RE = /^(F\d+) \[toolupgrade\] \[upgrade\] failed: /i

// counterGap(lines) -> { tally, tallyLines, words, gap, pathBCrafted,
//                        pathBFailed, pathAFailed, residual } | null
//   tally        the LAST tally line's upgraded=N (null when no tally line)
//   tallyLines   tally lines seen (one per face's final console line)
//   words        the census's event count (UPGRADE_RE lines)
//   gap          tally - words (null when no tally line)
//   pathBCrafted local-path verdicts that incremented the counter without
//                printing words (the surplus's named window)
//   pathBFailed  local-path verdicts that counted nothing
//   pathAFailed  delegated-path exception words (words the tally could not
//                have counted as ok - the deficit's named window)
//   residual     gap - pathBCrafted + pathAFailed (null when no tally) -
//                the unexplained remainder after both named windows
export function counterGap (lines) {
  if (!Array.isArray(lines)) return null
  let tally = null
  let tallyLines = 0
  let words = 0
  let pathBCrafted = 0
  let pathBFailed = 0
  let pathAFailed = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const t = TALLY_RE.exec(line)
    if (t) {
      tally = Number(t[1])
      tallyLines++
      continue
    }
    if (UPGRADE_RE.test(line)) {
      words++
      continue
    }
    const b = PATHB_VERDICT_RE.exec(line)
    if (b) {
      if (b[3].toLowerCase() === 'crafted') pathBCrafted++
      else pathBFailed++
      continue
    }
    if (PATHA_FAIL_RE.test(line)) pathAFailed++
  }
  const gap = tally === null ? null : tally - words
  const residual = tally === null ? null : gap - pathBCrafted + pathAFailed
  return { tally, tallyLines, words, gap, pathBCrafted, pathBFailed, pathAFailed, residual }
}

// Tests for v0.283.0 THE STANCE STEP - the COMPOSED tree (the near-duplicate
// law's composition branch). The 1930 lane's bde0622 shipped the behavior
// (stanceStepBlocks + the four-form step on the vein sweep band) while this
// lane's parallel fire built the same cure with its own day-scale census
// (the row's step=/stepcut= tokens). TWIN behavior, COMPLEMENTARY
// instruments - the per-event forms name the fences live, the row census
// answers the day-scale question the ngap token opened: how many gap-band
// candidates did the step cure? The behavior stands byte-true (bde0622);
// this file pins the composition: the census wiring + the band coherence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stanceStepBlocks, stepWalkProgress, stanceStepRawWalk, stancePinRead, STANCE_STEP_WALK_MS, STANCE_STEP_RAW_MS, STANCE_STEP_RAW_REACH, LEDGE_CUT_REACH, sealCutClass, sweepDropRecord, belowResidueRow } from '../../src/lib/drops.mjs'

test('the ceil law: the whole-block step count closes the stand-off honestly', () => {
  assert.equal(stanceStepBlocks(1.5), null, 'distXZ === reach is INSIDE the magnet - the cut arms without help, no step')
  assert.equal(stanceStepBlocks(1.6), 1, 'just outside the magnet - the face 36411203362 census\'s own band (the candidates sat at 1.8-2.0)')
  assert.equal(stanceStepBlocks(2.5), 1, 'the whole 1.5-2.5 band reads 1 (ceil(1.0) = 1 - the ceil law\'s edge)')
  assert.equal(stanceStepBlocks(2.6), 2, 'beyond 2.5 two whole blocks are the honest count')
  assert.equal(stanceStepBlocks(0), null, 'standing on the column - nothing to close')
  assert.equal(stanceStepBlocks(-0.1), null, 'a negative stand-off is junk - no step')
  assert.equal(stanceStepBlocks(), null, 'the zero-arg call refuses')
  assert.equal(stanceStepBlocks(NaN), null, 'a junk distance claims no step')
  assert.equal(stanceStepBlocks(1.8, 1.2), 1, 'the reach injection - the fence family\'s test form')
  assert.equal(LEDGE_CUT_REACH, 1.5, 'the magnet law stands - the step closes the gap TO the fence, never widens the fence')
})

test('the composition coherence: every gap-band candidate reads a ONE-block step (the ngap class is the class the step cures)', () => {
  for (let d = 1.6; d <= 2.0; d += 0.1) {
    assert.equal(sealCutClass(d, 2), 'gap', `distXZ ${d.toFixed(1)} is the split's gap class (the setup)`)
    assert.equal(stanceStepBlocks(d), 1, `distXZ ${d.toFixed(1)}: the step closes the gap band in ONE block - the ngap census and the cure are the same class`)
  }
  assert.equal(sealCutClass(1.4, 2), 'cut', 'inside the magnet the split says cut - the step never fires there')
  assert.equal(stanceStepBlocks(1.4), null, 'the coherence holds at the magnet\'s inside edge')
})

test('the row carries the step: sweepDropRecord + the fleet row tail (the identity-extends law)', () => {
  const rec = sweepDropRecord({ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 })
  assert.equal(rec.stanceStep, 2)
  assert.equal(rec.stanceCut, 1)
  assert.equal(sweepDropRecord({ stanceStep: 'x' }).stanceStep, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ stanceCut: -3 }).stanceCut, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 }])
  assert.match(row, /ngap=4 step=2 stepcut=1 above1=0 aboveHigh=0$/, 'the step rides the row tail behind ngap - the legacy tokens keep their positions')
  assert.match(belowResidueRow([{ stanceStep: 2 }, { stanceCut: 1 }, null, undefined]), /step=2 stepcut=1 above1=0 aboveHigh=0$/, 'the fleet row sums the step and its conversions')
  assert.match(belowResidueRow([null, undefined, {}]), /ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
  assert.equal(belowResidueRow(undefined).endsWith('step=0 stepcut=0 above1=0 aboveHigh=0'), true, 'the zero-arg row carries the full tail')
})

test('the census is wired: the miner\'s step counts ride stats for the fleet row (the composition)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('stanceStepBlocks'), 'the miner imports the behavior fence (bde0622, byte-true)')
  assert.ok(minerSrc.includes("stanceCuts++ // (v0.283.0) the row's stepcut= - the step bought THIS cut"), 'the conversion census rides the recut branch (the step\'s own dig)')
  assert.ok(minerSrc.includes('sd.stanceStep += stanceSteps'), 'the armed-walk count accumulates into the stats')
  assert.ok(minerSrc.includes('sd.stanceCut += stanceCuts'), 'the conversion count accumulates into the stats')
  assert.ok(minerSrc.includes('sealCutGap: 0, stanceStep: 0, stanceCut: 0 }'), 'the stats seed grows with the step buckets')
  assert.ok(dropsSrc.includes('stanceStep: fl(stanceStep)'), 'the record normalizes the step census (junk floors at zero)')
  assert.ok(dropsSrc.includes('stepcut=${acc.stanceCut}'), 'the row renders the conversion tail (the v0.283.0 tail-append law)')
  const recutAt = minerSrc.indexOf('const recut = ledgeCutWanted(')
  const censusAt = minerSrc.indexOf('stanceCuts++')
  assert.ok(recutAt > 0 && censusAt > recutAt, 'the census increments AFTER the re-read arms - the count is the re-read\'s conversion, never a guess')
})

test('the walk contest names itself: the step\'s bottleneck speaks (v0.285.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // face 36423614693: step=5 stepcut=2 with THREE walks contested - the cure
  // converts but its own bottleneck (the contested walk) stayed blind because
  // the catch swallowed gotoSafe's named refusal (the water-rescue gate, the
  // spin breaker, the doomed-goal ledger, the governor's timeout - every
  // family already has a name in the message).
  assert.ok(minerSrc.includes('vein sweep: stance step refused - the walk contested ('), 'the contest line keeps its byte-true prefix (the band pin holds) and grows the message window')
  assert.ok(minerSrc.includes("String(e?.message ?? 'no error read').slice(0, 40)"), 'the refusal name rides the SAME line, capped at 40 chars (the write-off ladder trace\'s own cap)')
  assert.ok(minerSrc.includes('} catch (e) {') || minerSrc.includes('catch (e)'), 'the catch binds the error - a swallowed contest is a blind decode')
})

test('the step re-arms against the doomed ledger: the honest attempt (v0.286.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // face 36431514130 (v0.285.0's first field read): the contest named its
  // families - 'the walk contested (doomed goal (ledgered 3s ago at
  // [-142,43...)' with the ledger CLUSTERED ([-113,41,427] [-114,41,428]
  // [-115,41,427] within 12s) - another bot's failed walk from ANOTHER start
  // dooms the support cell fleet-wide and the step dies at the consult for
  // free. The re-arm is the v0.87.0 yard lesson verbatim: ONE honest
  // bounded-A* attempt from THIS bot's start, the cap law unchanged.
  assert.ok(minerSrc.includes("timeoutMs: STANCE_STEP_WALK_MS, label: 'stance step', doomedRearm: true"), 'the step walk carries doomedRearm: true - the poisoned cell gets the honest attempt, a proven-dead verdict re-records with a fresh TTL (v0.288.0: the budget rides the measured constant, not a bare literal)')
  const armAt = minerSrc.indexOf('doomedRearm: true')
  const capAt = minerSrc.indexOf('stanceSteps < 1')
  assert.ok(armAt > 0 && capAt > 0, 'both the re-arm and the cap law live in the miner')
  assert.ok(armAt > capAt, 'the re-arm rides the capped walk (the cap gates first - the re-arm cannot orbit the sweep)')
})

test('the step progress: the timeout walk measures itself (v0.287.0)', () => {
  // face 36438371944 (the re-arm's first field flight, SUCCESS): step=3
  // stepcut=2 - the re-arm converts (67% vs 40% and 0%), the doomed-goal
  // suffix is GONE (the poisoning healed), and the ONLY remaining loss is
  // `the walk contested (stance step: timeout after 4000ms)` on the far
  // edge (dist 2.5). The timeout family owns the bottleneck, but a cure
  // needs the walk's anatomy: 'never moved' (a stuck pathfinder - a
  // geometry read) vs 'walked and the budget bit' (a budget or a retry).
  // The progress read names the distance; junk names nothing.
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: 4, z: 6 }), 5, 'a clean 3-4-5 read walks 5')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: 1, z: 2 }), 0, 'a zero-progress read walks 0 - the stuck class names itself')
  assert.equal(stepWalkProgress(null, { x: 4, z: 6 }), null, 'a missing start names nothing')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, null), null, 'a missing end (a lost entity) names nothing')
  assert.equal(stepWalkProgress({ x: NaN, z: 2 }, { x: 4, z: 6 }), null, 'a junk start coordinate names nothing')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: Infinity, z: 6 }), null, 'a junk end coordinate names nothing')
  assert.equal(stepWalkProgress(undefined, undefined), null, 'junk in, nothing out')
})

test('the step progress is wired: the start fixes at the arm, the catch appends the distance (v0.287.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const letAt = minerSrc.indexOf('let stepFrom = null')
  const armAt = minerSrc.indexOf('stanceSteps++')
  const setAt = minerSrc.indexOf('stepFrom = { x: bot.entity.position.x, z: bot.entity.position.z }')
  const gotoAt = minerSrc.indexOf('doomedRearm: true')
  assert.ok(letAt > 0 && setAt > 0, 'the start lives past the catch (a const inside the try dies with it)')
  assert.ok(letAt > armAt && setAt > letAt && gotoAt > setAt, 'the order is arm -> fix the start -> walk (the progress measures THIS walk)')
  assert.ok(minerSrc.includes('stepWalkProgress(stepFrom, bot.entity && bot.entity.position)'), 'the catch reads the progress from the fixed start and the live position')
  assert.ok(minerSrc.includes('`, walked ${walked.toFixed(1)}`'), 'the distance rides the SAME line (the tail-append law) - junk stays bare')
  assert.ok(minerSrc.includes("String(e?.message ?? 'no error read').slice(0, 40)"), 'the 40-char message window keeps its byte-true shape (the v0.285.0 pin holds)')
})

test('the step budget: the measured cure for the slow class (v0.288.0)', () => {
  // face 36446143946 (the progress instrument's first field read, SUCCESS):
  // `the walk contested (stance step: timeout after 4000ms, walked 1.2)`
  // (F6, armed dist 2.5). The bot WALKED 1.2 blocks inside the 4000ms
  // budget (~0.3 b/s under the fleet's CPU-starved A*) - the SLOW class,
  // the walk moves and the budget bit mid-stride. A near-zero walked would
  // have named the stuck class (a geometry cure); the real distance names
  // the budget. The measured speed prices the far edge: the band's span
  // (dist 2.5 -> inside the magnet, plus the GoalNear range-1 slack) is
  // ~2 blocks of walk, ~6.7s at the measured speed - 8000ms covers it with
  // margin. The cap law is unchanged: one bounded walk per sweep, the
  // worst case stays priced (one 8s walk, not an orbit).
  assert.equal(STANCE_STEP_WALK_MS, 8000, 'the budget is the measured 8000ms - the far edge\'s ~2-block walk at the measured ~0.3 b/s needs ~6.7s')
  assert.ok(STANCE_STEP_WALK_MS * 0.3 / 1000 >= 2.2, 'the budget buys the far edge\'s walk plus the GoalNear slack at the measured speed')
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('timeoutMs: STANCE_STEP_WALK_MS, label: \'stance step\''), 'the walk\'s timeout rides the measured constant (the budget lives in the lib, priced and pinned - not a bare literal)')
  assert.ok(minerSrc.includes('STANCE_STEP_WALK_MS, DROP_GOAL_BELOW'), 'the constant rides the dig-down import (the walk family imports together)')
  assert.ok(!minerSrc.includes("timeoutMs: 4000, label: 'stance step'"), 'the stance step\'s measured-insufficient 4000ms literal is GONE (the other walks\' own 4000ms budgets are not this fire\'s business)')
})

test('the landed-short read: the landed-refuses line measures its own walk (v0.289.0)', () => {
  // face 36446143946 named the landed-short class: F14's step LANDED (no
  // contest) but the cut still refused at dist 1.6 - the SAME dist the arm
  // measured. Two anatomies fit: the GoalNear range-1 slack landed the bot
  // SHORT of the cell (the range 1->0 tightening cures) OR the support cell
  // itself sits geometrically outside the magnet (only a better cell cures
  // - a range change is a no-op there). The contested line has measured its
  // walk since v0.287.0; the landed-refuses line was blind. The same
  // junk-safe read rides the refusal line's tail - a near-zero walked says
  // the cell geometry is the bottleneck, a real distance says the slack ate
  // the gain. The landed-TOOK line stays bare (a converted cut explains
  // nothing).
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const readExpr = 'stepWalkProgress(stepFrom, bot.entity && bot.entity.position)'
  const count = minerSrc.split(readExpr).length - 1
  assert.ok(count >= 2, 'the progress read lives on BOTH loss forms (the contested line v0.287.0 + the landed-refuses line v0.289.0)')
  const refusesAt = minerSrc.indexOf('the cut still refuses - ${ledgeCutRefusal(')
  assert.ok(refusesAt > 0, 'the landed-refuses line exists in the miner')
  const tailAt = minerSrc.indexOf(readExpr, refusesAt)
  assert.ok(tailAt > refusesAt, 'the walked read rides the refusal line\'s TAIL (the tail-append law - the byte-true prefix keeps the band pin)')
  assert.ok(minerSrc.includes("`, walked ${walked.toFixed(1)}`"), 'the distance formats identically on both loss forms (one read, two riders)')
  const tookAt = minerSrc.indexOf('the cut took the column')
  const tookLine = minerSrc.slice(tookAt, minerSrc.indexOf('\n', tookAt))
  assert.ok(!tookLine.includes(readExpr), 'the landed-TOOK line stays bare (a converted cut has nothing to explain)')
})

// (v0.291.0) THE RAW STANCE STEP - the walk mock: physics steps toward the
// cell center inside waitForTicks (the real bot's movement timing), the
// controls ledger records every setControlState (the finally-clear is
// assertable), the surprises are switchable (noTicks).
function rawWalkMock ({ cell, step, noTicks = false }) {
  const tx = cell.x + 0.5
  const tz = cell.z + 0.5
  const p = { x: 0, y: 64, z: 0 }
  const held = []
  return {
    entity: { position: p },
    _held: held,
    setControlState (name, on) { held.push(`${name}:${on ? 1 : 0}`) },
    async lookAt () { /* the bearing re-acquire resolves */ },
    async waitForTicks () {
      if (noTicks) throw new Error('no ticks')
      const dx = tx - p.x
      const dz = tz - p.z
      const d = Math.hypot(dx, dz)
      if (d > 0 && step > 0) {
        const k = Math.min(1, step / d)
        p.x += dx * k
        p.z += dz * k
      }
    }
  }
}

test('the raw stance hop: the constants are priced (v0.291.0)', () => {
  // face 36459280773 named the STUCK class: 3x `timeout after 8000ms, walked
  // 0.0` - the A* think never STARTS under CPU saturation, no budget of time
  // buys a step the thinker never priced (the v0.48.0 yard lesson verbatim).
  // The raw budget covers a 1-2 block sprint plus the re-acquires; the cap
  // law prices the worst case at raw + bounded, ONE step per sweep.
  assert.equal(STANCE_STEP_RAW_MS, 2500, 'the raw budget is the wall-clock honest 2500ms - the 1-2 block sprint is ~0.5-1s of physics, the re-acquires covered')
  assert.equal(STANCE_STEP_RAW_REACH, 1.2, 'the XZ reach is the cell-center landing - the walk lands where the GoalNear range-1 attempt did')
  assert.ok(STANCE_STEP_RAW_MS + STANCE_STEP_WALK_MS <= 11000, 'the cap law stays priced: one step per sweep is raw 2500 + bounded 8000, not an orbit')
})

test('the raw stance hop: the walk itself (v0.291.0)', async () => {
  const cell = { x: 3, z: 4 } // center (3.5, 4.5); the mock starts 5.7 away
  const converging = rawWalkMock({ cell, step: 0.9 })
  assert.equal(await stanceStepRawWalk(converging, cell), true, 'a converging walk lands true (raw controls, no pathfinder)')
  assert.ok(converging._held.includes('forward:1') && converging._held.includes('sprint:1'), 'the raw controls engage')
  assert.deepEqual(converging._held.slice(-3), ['forward:0', 'sprint:0', 'jump:0'], 'the finally clears every control on the landing path')
  const there = rawWalkMock({ cell, step: 0 })
  there.entity.position = { x: cell.x + 0.5, y: 64, z: cell.z + 0.5 }
  assert.equal(await stanceStepRawWalk(there, cell), true, 'an already-landed bot returns true')
  assert.equal(there._held.length, 0, 'the fast path touches no control')
  assert.equal(await stanceStepRawWalk(rawWalkMock({ cell, step: 0.9 }), null), false, 'a junk cell claims no walk')
  assert.equal(await stanceStepRawWalk(rawWalkMock({ cell, step: 0.9 }), { x: NaN, z: 4 }), false, 'a NaN cell claims no walk')
  assert.equal(await stanceStepRawWalk({}, cell), false, 'a control-less bot returns false (the caller falls to the bounded A*)')
})

test('the raw stance hop: the stall shape and the deadline honesty (v0.291.0)', async () => {
  const cell = { x: 3, z: 4 }
  const stalled = rawWalkMock({ cell, step: 0 })
  const t0 = Date.now()
  assert.equal(await stanceStepRawWalk(stalled, cell, { ms: 40 }), false, 'a stalled walk burns the deadline and returns false (the caller falls to the bounded A*)')
  assert.ok(Date.now() - t0 >= 35, 'the deadline bounds the stall (the worst case stays priced)')
  assert.ok(stalled._held.includes('jump:1') && stalled._held.includes('jump:0'), 'the not-converging branch hops the step (the rawHopWalk stall shape)')
  const slow = rawWalkMock({ cell, step: 0.04 })
  assert.equal(await stanceStepRawWalk(slow, cell, { ms: 4000 }), true, 'a near-stall crawler still lands')
  assert.ok(slow._held.includes('jump:1'), 'the hop re-acquire fired on the crawl (the re-acquire rides the not-converging branch)')
  const noTicks = rawWalkMock({ cell, step: 0.9, noTicks: true })
  assert.equal(await stanceStepRawWalk(noTicks, cell, { ms: 200 }), false, 'a waitForTicks surprise returns false, never throws')
})

test('the raw stance step wiring: the two-stage walk (v0.291.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('const rawLanded = await stanceStepRawWalk(bot, supportCell)'), 'the raw hop walks FIRST (no pathfinder, no think budget - the stuck class\'s cure)')
  assert.ok(/if \(!rawLanded\) \{\s*await gotoSafe\(bot, new goals\.GoalNear\(supportCell\.x, bot\.entity\.position\.y, supportCell\.z, 1\), \{ timeoutMs: STANCE_STEP_WALK_MS, label: 'stance step', doomedRearm: true \}\)\s*\}/.test(minerSrc), 'the bounded-A* attempt only fires when the raw walk did NOT land (the deposit caller\'s proven two-stage shape)')
  assert.ok(minerSrc.includes('timeoutMs: STANCE_STEP_WALK_MS, label: \'stance step\''), 'the bounded stage keeps the measured 8000ms budget (the v0.288.0 wiring stands)')
})

test('the stance pin read: the solid names itself (v0.292.0)', () => {
  // face 36469896303 refuted BOTH walk anatomies: the RAW stage burned its
  // 2500ms first (the 8000ms contested line is the bounded stage - it only
  // fires when the raw hop missed) and the bot still covered walked 0.0/0.1.
  // A bot that holds forward+sprint+jump and covers zero ground is PINNED by
  // geometry. The read probes the first cell along the bearing at the bot's
  // own layer (the feet cell, then the head cell) and names the solid.
  const cell = { x: 3, y: 59, z: 4 }
  const from = { x: 1, y: 59.2, z: 2 } // bearing (2.83, 2.83)/4.0 -> probe cell (1.707, 2.707) -> floor (1, 2)
  const solid = (x, y, z) => (y === 59 || y === 60) && x === 1 && z === 2 ? { name: 'stone' } : { name: 'air' }
  assert.deepEqual(stancePinRead(from, cell, solid), { name: 'stone', x: 1, y: 59, z: 2 }, 'a feet-level solid names itself with its cell')
  const headOnly = (x, y, z) => y === 60 && x === 1 && z === 2 ? { name: 'dirt' } : { name: 'air' }
  assert.deepEqual(stancePinRead(from, cell, headOnly), { name: 'dirt', x: 1, y: 60, z: 2 }, 'a head-level solid names itself when the feet read open')
  const open = (x, y, z) => ({ name: 'air' })
  assert.equal(stancePinRead(from, cell, open), null, 'an open read (air at both) prints nothing - the pit class names itself by absence')
  const wet = (x, y, z) => y === 59 && x === 1 && z === 2 ? { name: 'water' } : { name: 'air' }
  assert.deepEqual(stancePinRead(from, cell, wet), { name: 'water', x: 1, y: 59, z: 2 }, 'a fluid pin names itself honestly (the wet class reads its own name)')
  assert.equal(stancePinRead({ x: cell.x + 0.1, y: 59, z: cell.z + 0.1 }, cell, solid), null, 'standing at the cell - the pin is not ahead, it is the column itself')
  assert.equal(stancePinRead(null, cell, solid), null, 'a junk from refuses')
  assert.equal(stancePinRead(from, null, solid), null, 'a junk cell refuses')
  assert.equal(stancePinRead(from, cell, null), null, 'a missing probe refuses (the read never fires blind)')
  assert.equal(stancePinRead({ x: NaN, y: 59, z: 2 }, cell, solid), null, 'a NaN coordinate refuses')
  assert.equal(stancePinRead(from, cell, () => { throw new Error('world gone') }), null, 'a throwing world read refuses (never throws)')
  assert.equal(stancePinRead(from, cell, () => null), null, 'a lost block read refuses')
})

test('the stance pin read: the tail wiring (v0.292.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const pinExpr = 'const pin = stancePinRead(bot.entity && bot.entity.position, supportCell, (x, y, z) => bot.blockAt(new Vec3(x, y, z)))'
  const count = minerSrc.split(pinExpr).length - 1
  assert.ok(count >= 2, 'the pin read rides BOTH loss forms (the contested line + the landed-refuses line - one read, two riders)')
  assert.ok(minerSrc.includes('if (walked <= 0.3)'), 'the pin rides the near-zero walked gate only (the pinned class\'s own signature - a real walk explains itself)')
  assert.ok(minerSrc.includes('`, pinned ${pin.name}@${`[${pin.x},${pin.y},${pin.z}]`}`'), 'the pin token formats name@[x,y,z] (the doomed-ledger coord shape)')
  const tookAt = minerSrc.indexOf('the cut took the column')
  const tookLine = minerSrc.slice(tookAt, minerSrc.indexOf('\n', tookAt))
  assert.ok(!tookLine.includes('stancePinRead'), 'the landed-TOOK line stays bare (a converted cut has nothing to explain)')
})

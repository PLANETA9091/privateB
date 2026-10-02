#!/usr/bin/env node
//
// ci-stall.mjs - THE STALL CLOCK's field reader (v0.508.0)
// Fetches the repo's recent runs + their jobs and prints the verdict
// the fires kept deriving by hand: is the CI queue starved or slow?
//
//   GITHUB_TOKEN=ghp_xxx node scripts/ci-stall.mjs [runs=10]
//
// Env: GITHUB_TOKEN (a repo-scope PAT), GITHUB_REPOSITORY (default
// PLANETA9091/privateB). Prints the clock, the queue, the pickup law's
// evidence and the quota-wall signature - exit 0 always (a read, not a
// gate).
import { stallClock } from '../src/lib/stallclock.mjs'

const repo = process.env.GITHUB_REPOSITORY || 'PLANETA9091/privateB'
const token = process.env.GITHUB_TOKEN || ''
if (!token) {
  console.error('[ci-stall] no GITHUB_TOKEN - the read needs the API')
  process.exit(1)
}
const nRuns = Math.max(1, Math.min(40, Number(process.argv[2]) || 10))
const H = { Authorization: `token ${token}`, 'User-Agent': 'privateB-stallclock' }

const runsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=${nRuns}`, { headers: H })
if (!runsRes.ok) {
  console.error(`[ci-stall] runs fetch failed: HTTP ${runsRes.status}`)
  process.exit(1)
}
// the jobs walk - the pickup law reads job-level truth, and the last
// real pickup can sit DEEP in the list (a run of cancelled-runs-without-
// jobs separates it from the head: the evening stall's own shape). Walk
// newest->oldest until a pickup is found, bounded by MAX_WALK runs.
const MAX_WALK = 60
const runsJson = await runsRes.json()
let runs = runsJson.workflow_runs || []
if (runsJson.total_count > runs.length && runs.length < MAX_WALK) {
  const p2 = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=${MAX_WALK}`, { headers: H })
  if (p2.ok) runs = (await p2.json()).workflow_runs || []
}
const jobs = []
for (const r of runs.slice(0, MAX_WALK)) {
  if (!r || !r.id) continue
  // NO early exit on created_at: a run can sit in the queue for hours
  // before its pickup (face 44 was born 09:06Z, its last job picked up
  // 15:49Z) - created_at is not a lower bound on the pickup time. The
  // bounded walk of MAX_WALK runs is the honest price.
  const jRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${r.id}/jobs?per_page=20`, { headers: H })
  if (!jRes.ok) continue
  const jJson = await jRes.json()
  for (const jb of jJson.jobs || []) jobs.push(jb)
}

const clock = stallClock({ runs, jobs, nowMs: Date.now() })
const iso = ms => ms === null || ms === undefined ? 'never' : new Date(ms).toISOString()
const age = ms => ms === null || ms === undefined ? '-' : `${Math.round(ms / 60000)}min`

console.log('=== STALL CLOCK ===')
const oldestRun = runs.length ? runs[runs.length - 1] : null
console.log(`window: ${runs.length} runs (covers back to ${oldestRun ? oldestRun.created_at : '-'}) + ${jobs.length} jobs fetched, ${clock.pickedJobs} honestly picked up`)
console.log(`verdict: ${clock.verdict.toUpperCase()}${clock.quotaWallSuspected ? ' + THE QUOTA-WALL SIGNATURE FIRED (no pickup in the window while the queue starves - cancelling fixes nothing, the reset or the owner does)' : ''}`)
console.log(`queue: depth ${clock.queueDepth} / oldest waiting ${age(clock.oldestQueuedAgeMs)} / in-progress jobs ${clock.inProgress}`)
console.log(`pickup: last ${iso(clock.lastPickupAtMs)} (age ${age(clock.pickupAgeMs)}) / last job event ${iso(clock.lastFinishAtMs)} (age ${age(clock.finishAgeMs)}) / runner-assigned jobs in window ${clock.pickedJobs}`)
for (const r of runs.filter(r => r.status !== 'completed').slice(0, 5)) {
  console.log(`  waiting: ${r.id} ${r.status} ${String(r.head_sha).slice(0, 7)} born ${r.created_at}`)
}

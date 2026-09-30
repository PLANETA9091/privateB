#!/usr/bin/env node
// (v0.332.0) THE FAIRNESS FIRST-AID - the account-level queue instrument.
//
// The 0938-1038 fires learned the hard way that a repo can starve while its
// own group sits EMPTY: the concurrency group is per-ref, but the runner pool
// is per-ACCOUNT, and a sibling repo's self-generated backlog (an agent
// dispatching + workflow_run cascades at 100-300 runs/hour vs a ~135/hour
// drain) monopolizes the account FIFO - privateB's face dispatch sat queued
// behind ~660 runs it had never seen. The cure was surgical: cancel the
// QUEUED runs created before ours (queued = started no work, nothing lost;
// in-flight and workflows untouched) so the account's head-of-line returns to
// the run that needs it. This tool makes that audit + cure one command for
// every future lane.
//
// Subcommands:
//   sweep <owner>                 per-repo: running / queued / last SUCCESS
//   fifo <owner>                  who is the account's head-of-line? (oldest
//                                 queued run per repo - the starvation check)
//   cancel-older-than <owner> <repo> <ISO>   cancel QUEUED runs created before
//                                 ISO (queued-only by law; the body-guard)
//
// Auth: GH_TOKEN or GITHUB_TOKEN env. NEVER a token argument or a literal -
// the repo is public; the token does not live in source (the test pins it).
const API = 'https://api.github.com';

function tok() {
  const t = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!t) {
    console.error('no GH_TOKEN/GITHUB_TOKEN in env - refusing to guess');
    process.exit(2);
  }
  return t;
}

async function gh(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `token ${tok()}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function runs(repo, pages = 3) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const d = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${p}`);
    const batch = d.workflow_runs || [];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function sweep(owner) {
  const repos = await gh(`/users/${owner}/repos?per_page=100&sort=pushed`);
  for (const r of repos) {
    const rs = await runs(r.full_name);
    const running = rs.filter((x) => x.status === 'in_progress').length;
    const queued = rs.filter((x) => x.status === 'queued').length;
    const lastOk = rs.find((x) => x.conclusion === 'success');
    console.log(
      `${r.full_name.padEnd(30)} running:${running} queued:${queued}` +
        ` lastSuccess:${lastOk ? lastOk.created_at : 'none-in-window'}`
    );
  }
}

async function fifo(owner) {
  const repos = await gh(`/users/${owner}/repos?per_page=100&sort=pushed`);
  const heads = [];
  for (const r of repos) {
    const rs = await runs(r.full_name);
    const q = rs
      .filter((x) => x.status === 'queued')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (q.length) {
      heads.push({ repo: r.full_name, head: q[0], depth: q.length });
    }
  }
  heads.sort((a, b) => a.head.created_at.localeCompare(b.head.created_at));
  for (const h of heads) {
    console.log(
      `${h.head.created_at}  ${h.repo}  head ${h.head.id} (${h.head.event})` +
        ` depth~${h.depth}${h.repo.includes('privateB') ? '  <-- OURS' : ''}`
    );
  }
  if (heads.length && !heads[0].repo.includes('privateB')) {
    console.log('STARVED: the account head-of-line is not ours - see cancel-older-than');
  } else if (heads.length) {
    console.log('FAIR: a privateB run is the account head-of-line');
  } else {
    console.log('EMPTY: no queued runs anywhere - the group is the only queue');
  }
}

// The body-guard law: QUEUED ONLY. A queued run has started no work; an
// in-progress run may be mid-benchmark, mid-upload, mid-life. This tool never
// touches in-progress, never disables a workflow, never cancels by conclusion.
async function cancelOlderThan(owner, repo, iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    console.error('usage: cancel-older-than <owner> <repo> <ISO-timestamp>');
    process.exit(2);
  }
  const full = `${owner}/${repo}`;
  const rs = await runs(full, 20);
  const targets = rs.filter((x) => x.status === 'queued' && x.created_at < iso);
  console.log(`queued runs created before ${iso}: ${targets.length}`);
  let n = 0;
  for (const t of targets) {
    const res = await fetch(`${API}/repos/${full}/actions/runs/${t.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `token ${tok()}`, Accept: 'application/vnd.github+json' },
    });
    n += 1;
    if (n % 100 === 0) console.log(`  ${n} sent...`);
    if (res.status === 409) {
      /* already terminal - fine */
    } else if (!res.ok && res.status !== 202) {
      console.error(`  ${t.id} -> ${res.status}`);
    }
  }
  console.log(`DONE: ${n} cancel requests sent (queued-only)`);
}

const [cmd, ...args] = process.argv.slice(2);
const table = { sweep, fifo, 'cancel-older-than': cancelOlderThan };
if (!cmd || !table[cmd]) {
  console.error('usage: account-sweep.mjs <sweep|fifo|cancel-older-than> [args]');
  process.exit(2);
}
table[cmd](...args).catch((e) => {
  console.error('failed:', e.message);
  process.exit(1);
});

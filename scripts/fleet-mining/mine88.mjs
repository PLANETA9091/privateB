// Mine a fleet run's log artifacts -> scripts/fleet-mining/runNN/ (gitignored).
// Usage: GH_TOKEN=ghp_xxx node scripts/fleet-mining/mine88.mjs [run_id]
//   run_id defaults to the last known fleet dispatch; the token is read from
//   the env ONLY (never hardcode it - the redaction lesson).
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN env required'); process.exit(1); }
const runId = process.argv[2] || '35817410592';
const outDir = `/home/z/privateB/scripts/fleet-mining/run${String(runId).slice(-2)}`;
mkdirSync(outDir, { recursive: true });

const names = ['fleet19-log', 'fleet-server-log', 'fleet-logs'];
const arts = JSON.parse(execSync(`curl -s -H "Authorization: token ${token}" "https://api.github.com/repos/PLANETA9091/privateB/actions/runs/${runId}/artifacts"`).toString());
let found = 0;
for (const a of arts.artifacts || []) {
  if (!names.includes(a.name)) continue;
  found++;
  console.log('downloading', a.id, a.name, a.size_in_bytes, 'bytes');
  execSync(`curl -sL -H "Authorization: token ${token}" -o "${outDir}/${a.name}.zip" "https://api.github.com/repos/PLANETA9091/privateB/actions/artifacts/${a.id}/zip"`);
}
if (!found) { console.error('no fleet artifacts on run', runId); process.exit(1); }
execSync(`cd "${outDir}" && for z in *.zip; do unzip -o -q "$z" -d "x${z%.zip}"; done && ls -la`, { shell: '/bin/bash', stdio: 'inherit' });
console.log('done ->', outDir);

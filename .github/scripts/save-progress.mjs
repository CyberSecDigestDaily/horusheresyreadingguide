// Saves ticks relayed through ntfy.sh into progress.json.
// Run by .github/workflows/save-progress.yml. The relay keeps 12 hours of messages and this
// runs every 15 minutes, so a tick is saved long before it expires. Newest stamp per book wins,
// so re-reading old messages is harmless.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const html = readFileSync('index.html', 'utf8');
const topic = process.env.RELAY_TOPIC || (/var RELAY_TOPIC = '([A-Za-z0-9_-]{16,64})'/.exec(html) || [])[1];
const orderSrc = (/var ORDER = \[([^\]]*)\]/.exec(html) || [])[1];
if (!topic || !orderSrc) throw new Error('Could not read RELAY_TOPIC or ORDER from index.html');
const ORDER = orderSrc.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const known = new Set(ORDER);
const voidSrc = (/var VOID = (\[[^;]*\]);/.exec(html) || [])[1];
const VOID = voidSrc ? JSON.parse(voidSrc.replace(/'/g, '"')) : [];
const voided = (id, ts) => VOID.some(([b, from, to]) => b === id && ts >= from && ts <= to);

const file = process.env.PROGRESS_FILE || 'progress.json';
const prev = JSON.parse(readFileSync(file, 'utf8'));
if (prev.v !== 3 || !prev.items) throw new Error(`${file} is not a v3 progress file`);
const now = Date.now();
const rank = (s) => (s === 'd' ? 2 : s === 'l' ? 1 : 0);
const valid = (id, v) => known.has(id) && Array.isArray(v) && ['d', 'l', ''].includes(v[0]) &&
  Number.isFinite(v[1]) && v[1] > 1.6e12 && v[1] < now + 2 * 864e5 && !voided(id, v[1]);
const newer = (a, b) => !b || a[1] > b[1] || (a[1] === b[1] && rank(a[0]) > rank(b[0]));

const items = {};
let dropped = 0;
for (const [id, v] of Object.entries(prev.items)) { if (valid(id, v)) items[id] = v; else dropped++; }

async function readRelay() {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`, { headers: { 'User-Agent': 'hh-reading-log-save' } });
      if (!res.ok) throw new Error(`relay answered ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

let messages = 0;
let changes = 0;
for (const line of (await readRelay()).split('\n')) {
  if (!line.trim()) continue;
  let msg, body;
  try { msg = JSON.parse(line); } catch { continue; }
  if (msg.event !== 'message' || typeof msg.message !== 'string') continue;
  try { body = JSON.parse(msg.message); } catch { continue; }
  if (!body || body.hh !== 3 || !body.c || typeof body.c !== 'object') continue;
  messages++;
  for (const [id, v] of Object.entries(body.c)) {
    if (valid(id, v) && newer(v, items[id])) { items[id] = [v[0], v[1]]; changes++; }
  }
}

// GitHub turns off scheduled workflows after 60 days without a commit, so commit at least every 45.
let lastCommit = now;
try { lastCommit = Number(execSync('git log -1 --format=%ct').toString().trim()) * 1000 || now; } catch {}
const heartbeat = now - lastCommit > 45 * 864e5;

console.log(`${messages} relay message(s), ${changes} change(s), ${dropped} dropped${heartbeat ? ', heartbeat due' : ''}`);
if (!changes && !dropped && !heartbeat) process.exit(0);

const lines = ORDER.filter((id) => items[id]).map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(items[id])}`);
writeFileSync(file, `{\n  "v": 3,\n  "saved": ${JSON.stringify(new Date(now).toISOString())},\n  "items": {\n${lines.join(',\n')}\n  }\n}\n`);

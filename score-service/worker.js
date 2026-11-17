// Shared scores for the game on ftorstensson.com. A Cloudflare Worker with one KV namespace bound as SCORES.
// API (what index.html expects via <html data-score-api="https://…">):
//   GET  /        -> {hi, games, board}
//   POST /play    -> {hi, games, board}      counts one game played
//   POST /score   {score, name?} -> {hi, games, board}   name (1-3 A-Z/0-9) puts it on the top 10
//   POST /hit     {p, n}  -> 204           counts one page view (n=1: first view today from this browser)
//   GET  /stats   -> numbers for the Boards hub's Website card (last 7 days vs the 7 before, top 3 pages, games)
// No secrets. Anyone can send a score with enough effort; the checks below keep out junk and rude names.

const ORIGINS = ['https://www.ftorstensson.com', 'https://ftorstensson.com', 'https://ftorstensson.github.io'];
const MAX_SCORE = 99999; // the game shows five digits
const BAD = new Set(['ASS','FUK','FUC','FCK','FKU','FUQ','CUM','TIT','DIK','DIC','COK','KKK','NIG','FAG','CNT','KUK','PIS','SHT','NAZ','JIZ','VAG','KYS','SUX','XXX','WTF','POO','HOE']);
const KEY = 'state';

const clean = (b) => (Array.isArray(b) ? b : [])
  .map((r) => ({ n: String(r.n || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3), s: Math.max(0, Math.min(MAX_SCORE, r.s | 0)) }))
  .filter((r) => r.n && r.s > 0)
  .sort((a, b) => b.s - a.s)
  .slice(0, 10);

function cors(req) {
  const o = req.headers.get('origin') || '';
  return {
    'access-control-allow-origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'origin',
  };
}

const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(req) } });

async function load(env) {
  const s = (await env.SCORES.get(KEY, 'json')) || {};
  return { hi: Math.max(0, s.hi | 0), games: Math.max(0, s.games | 0), board: clean(s.board) };
}


// ---- Site counter (for the Boards hub). One KV key per Sydney day: {v: views, u: visitors, p: {path: views}}.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|monitor/i;
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(t); // YYYY-MM-DD
const cleanPath = (p) => {
  p = String(p || '/').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '') || '/';
  return /^\/[a-z0-9/_-]{0,40}$/.test(p) ? p : null;
};

async function hit(req, env) {
  if (BOT.test(req.headers.get('user-agent') || '')) return;
  let b = {};
  try { b = JSON.parse(await req.text()); } catch (e) { return; }
  const p = cleanPath(b.p);
  if (!p) return;
  const k = 'd:' + day(Date.now());
  const d = (await env.SCORES.get(k, 'json')) || { v: 0, u: 0, p: {} };
  d.v += 1;
  if (b.n === 1) d.u += 1;
  if (Object.keys(d.p).length < 200 || d.p[p]) d.p[p] = (d.p[p] || 0) + 1;
  await env.SCORES.put(k, JSON.stringify(d), { expirationTtl: 60 * 60 * 24 * 40 });
}

async function stats(env) {
  const now = Date.now(), days = [];
  for (let i = 0; i < 14; i++) days.push(day(now - i * 864e5));
  const rows = await Promise.all(days.map((d) => env.SCORES.get('d:' + d, 'json')));
  const sum = (a) => a.reduce((t, r) => ({ v: t.v + (r ? r.v : 0), u: t.u + (r ? r.u : 0) }), { v: 0, u: 0 });
  const cur = sum(rows.slice(0, 7)), prev = sum(rows.slice(7));
  const paths = {};
  rows.slice(0, 7).forEach((r) => r && Object.entries(r.p).forEach(([k, n]) => { paths[k] = (paths[k] || 0) + n; }));
  const top = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, value]) => ({ label, value }));
  const st = await load(env);
  return {
    project: 'p-website', source: 'Site counter', period: 'Last 7 days', at: new Date(now).toISOString(),
    numbers: [
      { label: 'Visitors', value: cur.u, prev: prev.u },
      { label: 'Page views', value: cur.v, prev: prev.v },
      { label: 'Games played', value: st.games },
    ],
    top,
    link: 'https://cloud.umami.is/websites/7b6bde43-458c-4604-83e6-8c2b839b1432',
  };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.get('origin');

    if (req.method === 'GET' && path === '/') return json(req, await load(env));
    if (req.method === 'GET' && path === '/stats') {
      const r = json(req, await stats(env));
      r.headers.set('access-control-allow-origin', '*');
      r.headers.set('cache-control', 'public, max-age=300');
      return r;
    }
    if (req.method !== 'POST') return json(req, { error: 'not found' }, 404);
    // Writes only from the site itself (stops casual scripts; not a lock).
    if (!ORIGINS.includes(origin)) return json(req, { error: 'forbidden' }, 403);

    if (path === '/hit') { await hit(req, env); return new Response(null, { status: 204, headers: cors(req) }); }

    const st = await load(env);
    if (path === '/play') {
      st.games += 1;
    } else if (path === '/score') {
      let body = {};
      try { body = await req.json(); } catch (e) { return json(req, { error: 'bad json' }, 400); }
      const score = body.score | 0;
      if (score < 0 || score > MAX_SCORE) return json(req, { error: 'bad score' }, 400);
      st.hi = Math.max(st.hi, score);
      if (body.name !== undefined) {
        const n = String(body.name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
        if (!n || BAD.has(n) || n.includes('88')) return json(req, { error: 'name' }, 400);
        if (score > 0) st.board = clean([...st.board, { n, s: score }]);
      }
    } else {
      return json(req, { error: 'not found' }, 404);
    }
    await env.SCORES.put(KEY, JSON.stringify(st));
    return json(req, st);
  },
};

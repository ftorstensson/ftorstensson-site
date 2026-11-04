// Shared scores for the game on ftorstensson.com. A Cloudflare Worker with one KV namespace bound as SCORES.
// API (what index.html expects via <html data-score-api="https://…">):
//   GET  /        -> {hi, games, board}
//   POST /play    -> {hi, games, board}      counts one game played
//   POST /score   {score, name?} -> {hi, games, board}   name (1-3 A-Z/0-9) puts it on the top 10
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

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.get('origin');

    if (req.method === 'GET' && path === '/') return json(req, await load(env));
    if (req.method !== 'POST') return json(req, { error: 'not found' }, 404);
    // Writes only from the site itself (stops casual scripts; not a lock).
    if (!ORIGINS.includes(origin)) return json(req, { error: 'forbidden' }, 403);

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

// Free Cloudflare Worker: serves the tool and fetches a public web page
// server-side (/api/fetch-page) so the browser is not blocked by CORS.
// No paid API, no storage, nothing is logged.

const json = (code, body) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { 'content-type': 'application/json', 'x-linkmetrics-proxy': '1', 'cache-control': 'no-store' }
  });

function badHost(h) {
  h = h.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return h.includes(':'); // any IPv6 literal
}

async function fetchPage(request) {
  let u;
  try { u = new URL(new URL(request.url).searchParams.get('url') || ''); } catch (e) { return json(400, { kind: 'blocked' }); }
  if (!/^https?:$/.test(u.protocol) || badHost(u.hostname)) return json(400, { kind: 'blocked' });
  try {
    const res = await fetch(u.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LinkMetricsBot/1.0)', accept: 'text/html,application/xhtml+xml' }
    });
    if (!res.ok) return json(502, { kind: 'http', status: res.status });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type && !/html|xml|text\//.test(type)) return json(415, { kind: 'type' });
    const text = (await res.text()).slice(0, 3000000);
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-linkmetrics-proxy': '1', 'cache-control': 'no-store' }
    });
  } catch (e) {
    return json(504, { kind: e && e.name === 'TimeoutError' ? 'timeout' : 'blocked' });
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/fetch-page') return fetchPage(request);
    return env.ASSETS.fetch(request);
  }
};

/**
 * hub-router.js - ONE domain (https://hubpa.com) in front of ALL bot servers.
 *
 *   hubpa.com/<filecode>            -> any healthy server -> redirects to t.me/<bot>?start=<filecode>
 *   hubpa.com/dl/<token>/<msg_id>   -> any healthy server -> streams / downloads the file (Range supported)
 *
 * Settings (Worker -> Settings -> Variables):
 *   ORIGINS   comma separated server URLs, no trailing slash:
 *             https://a.koyeb.app,https://b.koyeb.app,https://c.koyeb.app,https://d.onrender.com
 *   DL_MODE   "proxy"    (default) file bytes flow through Cloudflare, the user only ever sees hubpa.com
 *             "redirect" the user is sent to the chosen server's own URL for /dl/... (saves Cloudflare traffic)
 */
const BLOCKED = [/^\/tg\//, /^\/internal\//, /^\/api\//, /^\/monetag\//];   // never expose these through the domain

function parseOrigins(env) {
  return String(env.ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// servers that failed recently are tried last (this isolate only, resets by itself)
const down = new Map();
function order(origins) {
  const now = Date.now();
  const ok = origins.filter(o => (down.get(o) || 0) < now);
  const bad = origins.filter(o => (down.get(o) || 0) >= now);
  return shuffle(ok).concat(shuffle(bad));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (BLOCKED.some(r => r.test(url.pathname))) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const origins = parseOrigins(env);
    if (!origins.length) return new Response("ORIGINS is not set in the Worker", { status: 500 });

    const isDl = url.pathname.startsWith("/dl/");
    const redirectMode = isDl && String(env.DL_MODE || "proxy").toLowerCase() === "redirect";
    let lastStatus = 502;

    for (const origin of order(origins)) {
      const target = origin + url.pathname + url.search;
      try {
        if (redirectMode) {
          // quick check that this server is alive before sending the user there
          const probe = await fetch(origin + "/health", { method: "GET", signal: AbortSignal.timeout(6000) });
          if (!probe.ok) throw new Error("unhealthy " + probe.status);
          return Response.redirect(target, 302);
        }
        const headers = new Headers();
        for (const h of ["range", "if-range", "accept", "accept-encoding", "user-agent"]) {
          const v = request.headers.get(h);
          if (v) headers.set(h, v);
        }
        const res = await fetch(target, { method: request.method, headers, redirect: "manual",
                                          signal: AbortSignal.timeout(isDl ? 25000 : 15000) });
        if (res.status >= 500) { lastStatus = res.status; down.set(origin, Date.now() + 30000); continue; }
        const out = new Response(res.body, res);          // passes 200/206/302/404 + Range headers unchanged
        out.headers.set("X-Served-By", new URL(origin).hostname.split(".")[0]);
        return out;
      } catch (e) {
        down.set(origin, Date.now() + 30000);              // sleeping / dead server -> next one
      }
    }
    return new Response("All servers are busy or waking up, please retry in a few seconds.", {
      status: lastStatus === 502 ? 503 : lastStatus, headers: { "Retry-After": "10" } });
  },
};

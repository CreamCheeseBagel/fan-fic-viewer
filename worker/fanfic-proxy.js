// Cloudflare Worker: a small, self-hosted CORS proxy for Fan Fic Viewer.
//
// Why this exists
// ---------------
// Public CORS proxies share IP pools that are heavily abused, so
// fanfiction.net's Cloudflare frequently serves them a "Just a moment..."
// challenge instead of the page - worst on /search/, which can't be cached.
// A dedicated Worker has its own clean IP reputation and lets us send real
// browser-like request headers, which the static site itself cannot set
// (Sec-Fetch-* are forbidden headers; cookies are domain-scoped). That makes
// a challenge far less likely.
//
// Honest limitation: this is NOT a Cloudflare-challenge solver. If
// fanfiction.net actually issues a managed JS challenge, a Worker fetch gets
// the same interstitial - the static app detects that and reports it. The
// Worker's job is to avoid drawing the challenge in the first place, not to
// defeat one.
//
// Deploy: see worker/README.md.

// Only these hosts may be proxied, so this can't be abused as an open proxy.
const ALLOWED_HOSTS = new Set([
  "www.fanfiction.net",
  "fanfiction.net",
  "m.fanfiction.net",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET") {
      return json({ error: "Only GET is supported." }, 405);
    }

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return json({ error: "Missing ?url= parameter." }, 400);
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return json({ error: "Invalid url parameter." }, 400);
    }
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.host)) {
      return json({ error: `Host not allowed: ${parsed.host}` }, 403);
    }

    let upstream;
    try {
      upstream = await fetch(parsed.toString(), {
        // Real browser-like headers - the whole point of self-hosting.
        // No cookies/credentials are forwarded; requests are anonymous.
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
    } catch (err) {
      return json({ error: `Upstream fetch failed: ${err.message}` }, 502);
    }

    // Pass the body through with CORS so the browser can read it
    // cross-origin. Short edge cache helps repeated chapter fetches.
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

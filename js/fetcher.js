// Fetching helpers for a static (no-backend) site.
//
// fanfiction.net sends no Access-Control-Allow-Origin header, so a browser on
// a different origin can't fetch it directly. Requests are relayed through a
// CORS proxy, in two tiers:
//
//   1. An optional SELF-HOSTED proxy (CUSTOM_PROXY) - e.g. the Cloudflare
//      Worker in worker/fanfic-proxy.js. When configured it's tried FIRST:
//      a dedicated IP plus real browser-like request headers are far less
//      likely to draw a Cloudflare challenge than the shared, frequently-
//      abused IP pools behind public proxies (this is the failure mode that
//      breaks search - see docs/SPEC.md §5.2), and nothing the app fetches
//      passes through a third party you don't control.
//   2. PUBLIC proxies, as zero-setup fallback - and the only option if no
//      self-hosted proxy is configured.
//
// There is no user-facing picker; the chain is tried in order automatically.

// Your deployed self-hosted proxy base, written so the target URL can be
// appended url-encoded - e.g. "https://fanfic-proxy.you.workers.dev/?url=".
// Leave empty to use public proxies only (the default, zero-setup behavior).
// See worker/README.md to deploy one in a couple of minutes.
const CUSTOM_PROXY = "https://divine-disk-4afc.kimmelan.workers.dev/?url=";

const PUBLIC_PROXIES = [
  {
    label: "AllOrigins",
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    label: "corsproxy.io",
    build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
  {
    label: "codetabs.com",
    build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  },
];

// Ordered list of proxies to try: self-hosted first (when configured), then
// the public fallbacks. Exported (and parameterized) so the ordering can be
// unit-tested without a live network.
export function buildProxyChain(customProxyBase = CUSTOM_PROXY) {
  const chain = [...PUBLIC_PROXIES];
  if (customProxyBase) {
    chain.unshift({
      label: "self-hosted",
      build: (url) => `${customProxyBase}${encodeURIComponent(url)}`,
    });
  }
  return chain;
}

export async function fetchHtml(url) {
  const errors = [];
  for (const proxy of buildProxyChain()) {
    try {
      return await fetchViaProxy(url, proxy);
    } catch (err) {
      errors.push({ label: proxy.label, message: err.message, isChallenge: !!err.isChallenge });
    }
  }

  if (errors.length && errors.every((e) => e.isChallenge)) {
    throw new Error(
      "fanfiction.net's Cloudflare protection is blocking every available proxy right now " +
        "(this happens more often on search than on individual story pages, since search " +
        "responses can't be cached). A self-hosted proxy makes this far less likely - see " +
        "worker/README.md. Otherwise, try again in a few minutes, or load a story directly " +
        "by its URL if you have one."
    );
  }

  throw new Error(
    `All proxies failed:\n${errors.map((e) => `${e.label}: ${e.message}`).join("\n")}\n` +
      `The source may be blocking proxies right now. Try again later.`
  );
}

async function fetchViaProxy(url, proxy) {
  const target = proxy.build(url);

  let res;
  try {
    res = await fetch(target, { headers: { Accept: "text/html,*/*" } });
  } catch (err) {
    throw new Error(`network error (${err.message})`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text || text.length < 200) {
    throw new Error("empty/short response");
  }
  if (isCloudflareChallenge(text)) {
    const err = new Error("blocked by a Cloudflare challenge page");
    err.isChallenge = true;
    throw err;
  }
  return text;
}

// fanfiction.net sits behind Cloudflare and sometimes returns a "Just a
// moment..." interstitial (HTTP 200, real HTML, but no actual content)
// instead of the requested page. A proxy can't solve a JS challenge, so
// treat this as a failure and let fetchHtml retry through another proxy -
// a different exit IP is the only thing that might dodge it.
export function isCloudflareChallenge(text) {
  return (
    /<title>\s*Just a moment/i.test(text) &&
    /cf_chl_opt|challenge-platform/i.test(text)
  );
}

// Fetching helpers for a static (no-backend) site.
//
// fanfiction.net does not send CORS headers, so the browser cannot fetch it
// directly. We route requests through a public CORS proxy, automatically
// trying a backup if the primary fails or gets Cloudflare-challenged. This
// is intentionally invisible to the user (no proxy picker) - just
// resilience under the hood, since a single proxy hitting a Cloudflare
// challenge or rate limit otherwise fails the whole request with no
// recourse but "try again later".

const PROXIES = [
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

export async function fetchHtml(url) {
  const errors = [];
  for (const proxy of PROXIES) {
    try {
      return await fetchViaProxy(url, proxy);
    } catch (err) {
      errors.push(`${proxy.label}: ${err.message}`);
    }
  }

  throw new Error(
    `All proxies failed:\n${errors.join("\n")}\n` +
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
    throw new Error("blocked by a Cloudflare challenge page");
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

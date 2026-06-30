// Fetching helpers for a static (no-backend) site.
//
// fanfiction.net does not send CORS headers, so the browser cannot fetch it
// directly. We route requests through a public CORS proxy. Proxies come and go
// and may be rate-limited or blocked by the source's bot protection, so the
// proxy is user-selectable in settings.

export const PROXIES = [
  {
    id: "allorigins",
    label: "AllOrigins (raw)",
    build: (url) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    id: "corsproxy",
    label: "corsproxy.io",
    build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "codetabs",
    label: "codetabs.com",
    build: (url) =>
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  },
  {
    id: "direct",
    label: "Direct (no proxy)",
    build: (url) => url,
  },
];

export function getProxy(id) {
  return PROXIES.find((p) => p.id === id) || PROXIES[0];
}

// Tries the chosen proxy first, then falls back through the rest — public
// proxies are flaky and occasionally return 500s, so a single failure
// shouldn't block the read.
export async function fetchHtml(url, proxyId) {
  const preferred = getProxy(proxyId);
  const ordered = [preferred, ...PROXIES.filter((p) => p.id !== preferred.id)];

  const errors = [];
  for (const proxy of ordered) {
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
  return text;
}

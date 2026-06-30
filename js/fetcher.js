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

export async function fetchHtml(url, proxyId) {
  const proxy = getProxy(proxyId);
  const target = proxy.build(url);

  let res;
  try {
    res = await fetch(target, { headers: { Accept: "text/html,*/*" } });
  } catch (err) {
    throw new Error(
      `Network error via "${proxy.label}". The proxy may be down or blocked. ` +
        `Try a different proxy in settings. (${err.message})`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Proxy "${proxy.label}" returned HTTP ${res.status}. ` +
        `Try a different proxy in settings.`
    );
  }

  const text = await res.text();
  if (!text || text.length < 200) {
    throw new Error(
      `Got an empty/short response via "${proxy.label}". ` +
        `The source may be blocking the proxy. Try another proxy.`
    );
  }
  return text;
}

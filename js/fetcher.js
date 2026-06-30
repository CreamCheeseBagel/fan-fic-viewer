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
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
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

// Fetching helpers for a static (no-backend) site.
//
// fanfiction.net does not send CORS headers, so the browser cannot fetch it
// directly. We route requests through a public CORS proxy (AllOrigins).

const PROXY_BASE = "https://api.allorigins.win/raw?url=";

export async function fetchHtml(url) {
  const target = `${PROXY_BASE}${encodeURIComponent(url)}`;

  let res;
  try {
    res = await fetch(target, { headers: { Accept: "text/html,*/*" } });
  } catch (err) {
    throw new Error(
      `Network error reaching the proxy. It may be down or blocked right now. (${err.message})`
    );
  }

  if (!res.ok) {
    throw new Error(`Proxy returned HTTP ${res.status}. Try again in a moment.`);
  }

  const text = await res.text();
  if (!text || text.length < 200) {
    throw new Error(
      "Got an empty/short response. The source may be blocking the proxy right now."
    );
  }
  if (isCloudflareChallenge(text)) {
    throw new Error(
      "fanfiction.net is showing a Cloudflare challenge page right now. Try again in a moment."
    );
  }
  return text;
}

// fanfiction.net sits behind Cloudflare and sometimes returns a "Just a
// moment..." interstitial (HTTP 200, real HTML, but no actual content)
// instead of the requested page. A proxy can't solve a JS challenge, so
// treat this as a failure rather than silently parsing the interstitial.
export function isCloudflareChallenge(text) {
  return (
    /<title>\s*Just a moment/i.test(text) &&
    /cf_chl_opt|challenge-platform/i.test(text)
  );
}

# Self-hosted proxy (Cloudflare Worker)

The app works out of the box through public CORS proxies, but those share
abused IP pools that fanfiction.net's Cloudflare frequently challenges —
especially on search. Deploying this tiny Worker gives the app a dedicated,
clean-reputation IP and real browser-like request headers, which makes those
challenges far less likely. It's free on Cloudflare's Workers free tier
(100k requests/day at time of writing) and takes a couple of minutes.

> **What it does and doesn't do.** It avoids *drawing* a Cloudflare
> challenge; it does **not** *solve* one. If fanfiction.net issues a managed
> JS challenge anyway, a Worker fetch gets the same "Just a moment…" page,
> and the app reports it. It also only proxies fanfiction.net hosts (see
> `ALLOWED_HOSTS` in `fanfic-proxy.js`) so it can't be abused as an open
> proxy.

## Deploy (dashboard, no tooling)

1. Log in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create**
   → **Create Worker**.
2. Give it a name (e.g. `fanfic-proxy`) and **Deploy** the starter.
3. Click **Edit code**, replace the entire contents with
   [`fanfic-proxy.js`](fanfic-proxy.js), and **Deploy**.
4. Copy the Worker URL (e.g. `https://fanfic-proxy.YOUR-SUBDOMAIN.workers.dev`).

## Deploy (Wrangler CLI, optional)

```bash
npm install -g wrangler
wrangler login
wrangler deploy worker/fanfic-proxy.js --name fanfic-proxy
```

## Point the app at it

Edit [`../js/fetcher.js`](../js/fetcher.js) and set `CUSTOM_PROXY` to your
Worker URL **with `/?url=` appended**:

```js
const CUSTOM_PROXY = "https://fanfic-proxy.YOUR-SUBDOMAIN.workers.dev/?url=";
```

Commit and push. The app now tries your Worker first and only falls back to
the public proxies if it's unreachable. Leaving `CUSTOM_PROXY` empty keeps
the original public-proxy-only behavior.

## Verify

```bash
curl "https://fanfic-proxy.YOUR-SUBDOMAIN.workers.dev/?url=https%3A%2F%2Fwww.fanfiction.net%2Fs%2F3693839%2F1%2F"
```

Expect the story page HTML. A host-not-allowed JSON error means the `url`
parameter wasn't a permitted fanfiction.net link.

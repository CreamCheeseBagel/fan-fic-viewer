# Fan Fic Viewer

A clean, distraction-free reader for fanfiction. Paste a story URL and read the
whole thing — every chapter — in calm, adjustable typography. Built as a
**static site** so it can be hosted for free on GitHub Pages.

> Unofficial reader. All story content belongs to its original authors on the
> source sites.

See [`docs/SPEC.md`](docs/SPEC.md) for the full functional specification,
including known problems and limitations (CORS proxy reliability,
Cloudflare bot protection, markup fragility, and more) — read it before
filing an issue that turns out to be one of those.

## Supported sites

- ✅ **fanfiction.net**
- 🔜 More sites can be added via the adapter system (see below).

## How it works (and an important caveat)

GitHub Pages serves only static files — there is **no backend server**. So the
story is fetched **in your browser**. Because source sites don't send CORS
headers, the request is routed through a CORS proxy. There's no picker for
this — the app tries a chain automatically and falls through to the next
entry if one is down, rate-limited, or returns a Cloudflare challenge page,
so a single proxy having a bad moment usually isn't visible to you:

1. An **optional self-hosted proxy** (a Cloudflare Worker), tried first when
   configured — see [`worker/README.md`](worker/README.md). This is the
   reliable path: a dedicated, clean-reputation IP and real browser headers
   make Cloudflare far less likely to challenge it, especially for search.
2. **Public proxies** (AllOrigins → corsproxy.io → codetabs.com) as a
   zero-setup fallback, and the only path if no Worker is configured.

Two consequences to be aware of:

1. **Public proxies are unreliable.** They get rate-limited or go down. The
   automatic fallback covers most of this, but if every proxy fails at once
   the error lists what each one reported. The self-hosted Worker is the fix.
2. **Bot protection.** fanfiction.net sits behind Cloudflare, which sometimes
   serves a challenge page instead of the real content — more often on
   `/search/` than on story pages. A proxy can make this *less likely* (see
   the Worker) but can't *solve* a JS challenge once issued; if it happens,
   try again later.

## Features

- Loads an entire multi-chapter story with prev/next + chapter dropdown
- Keyboard navigation (← / →)
- Adjustable font size, line height, and light/sepia/dark themes
- Remembers your settings and last-read URL (localStorage)
- Per-session chapter caching to avoid re-fetching
- HTML is sanitized to a small allowlist before rendering

## Running locally

It's plain static files — no build step. Serve the folder with any static
server (a module-based app needs `http://`, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

Either:

- **Settings → Pages → Deploy from a branch**, pick your branch + `/ (root)`, or
- Use the included workflow at `.github/workflows/deploy.yml` (deploys on push
  to `main` via GitHub Actions).

`.nojekyll` is included so Pages serves the files as-is.

## Adding another site

Site-specific logic lives in `js/sites/`. Create an adapter implementing:

```js
{
  id,                       // string
  matches(url),             // -> boolean
  normalizeUrl(url),        // -> info object you define
  chapterUrl(info, n),      // -> URL string for chapter n
  parse(doc, info),         // -> { title, author, summary,
                            //      chapterCount, chapterTitles, chapterHtml }
}
```

then register it in `js/sites/index.js`. See `js/sites/fanfiction.js` for a
worked example.

## Project layout

```
index.html            reader UI shell
css/style.css         styles + themes
js/app.js             app state, navigation, settings
js/fetcher.js         proxy-chain fetch layer
js/sites/index.js     adapter registry
js/sites/fanfiction.js fanfiction.net adapter
worker/fanfic-proxy.js optional self-hosted Cloudflare Worker proxy
worker/README.md      Worker deploy + activation guide
```

For the full functional spec and known limitations, see
[`docs/SPEC.md`](docs/SPEC.md).

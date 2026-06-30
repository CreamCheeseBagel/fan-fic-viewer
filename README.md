# Fan Fic Viewer

A clean, distraction-free reader for fanfiction. Paste a story URL and read the
whole thing — every chapter — in calm, adjustable typography. Built as a
**static site** so it can be hosted for free on GitHub Pages.

> Unofficial reader. All story content belongs to its original authors on the
> source sites.

## Supported sites

- ✅ **fanfiction.net**
- 🔜 More sites can be added via the adapter system (see below).

## How it works (and an important caveat)

GitHub Pages serves only static files — there is **no backend server**. So the
story is fetched **in your browser**. Because source sites don't send CORS
headers, the request is routed through a public CORS proxy
([AllOrigins](https://allorigins.win/)).

Two consequences to be aware of:

1. **The proxy is unreliable.** Public CORS proxies get rate-limited or go
   down. If a load fails, it's usually transient — try again in a moment.
2. **Bot protection.** fanfiction.net sits behind Cloudflare, which sometimes
   serves a challenge page instead of the story. When that happens you'll get
   a clear "Cloudflare challenge page" error — try again later.

A small, self-hosted proxy (e.g. a Cloudflare Worker) is the most reliable
long-term option; the public proxy is a zero-setup default.

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
js/fetcher.js         CORS-proxy fetch layer
js/sites/index.js     adapter registry
js/sites/fanfiction.js fanfiction.net adapter
```

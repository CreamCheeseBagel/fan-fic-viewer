# Fan Fic Viewer — Functional Specification

## 1. Purpose

Serve fan fiction from open-access wiki/archive sites — starting with
[fanfiction.net](https://www.fanfiction.net/), with other sites intended to
follow — in a clean, human-readable, distraction-free format. The source
sites are dense with 2000s-era forum chrome (ads, nested dropdowns, inline
styles, font-size widgets); this app strips all of that down to just the
story text, paginated by chapter, with modern reading controls.

This is explicitly a **reader**, not a mirror or archive. It fetches content
live, on demand, from the source site on every visit — it stores no story
content of its own.

## 2. Scope

**In scope:**
- Loading a multi-chapter story from a pasted URL and reading it chapter by
  chapter
- Searching a supported source site by keyword
- Reading customization: font size, line height, light/sepia/dark theme
- Persisting reading settings and the last-opened story URL across sessions
- A pluggable adapter system so additional source sites can be added later

**Out of scope (by design, not oversight):**
- User accounts, login, reviews/favorites/follows, or any other
  write-interaction with the source site
- Downloading/exporting stories, or storing story content beyond a
  single browser tab's in-memory session cache
- Guaranteeing availability against a source site's bot protection (see
  §5.2) — this is a client-side reader with no backend, and that ceiling is
  structural, not a bug to be fixed later

## 3. Architecture

Static site, no backend, deployed to GitHub Pages via GitHub Actions on
every push to `main`.

```
index.html             reader UI shell
css/style.css           styles + themes
js/app.js               app state, navigation, settings, search UI
js/fetcher.js           proxy-chain fetch layer + Cloudflare-challenge detection
js/sites/index.js       adapter registry
js/sites/fanfiction.js  fanfiction.net adapter (parsing + URL building)
worker/fanfic-proxy.js  optional self-hosted Cloudflare Worker proxy
worker/README.md        Worker deploy + activation guide
tests/parser.test.mjs   Playwright-driven tests against real captured markup
```

Because GitHub Pages serves static files only, the browser fetches story
and search pages directly — see §5.1 for why that requires a proxy, and what
that costs in reliability.

### 3.3 Proxy chain

`fetchHtml()` relays every request through an ordered chain of proxies and
returns the first usable response:

1. **Self-hosted proxy** (optional, tried first) — set `CUSTOM_PROXY` in
   `js/fetcher.js` to a deployed `worker/fanfic-proxy.js` URL. A dedicated
   Worker has a clean-reputation IP and sends real browser-like request
   headers, both of which the static client cannot do for itself (§5.2), so
   it is markedly less likely to draw a Cloudflare challenge. It also keeps
   traffic off third-party proxies entirely (§5.6).
2. **Public proxies** (zero-setup fallback) — AllOrigins → corsproxy.io →
   codetabs.com, tried in order. These are the only path when no self-hosted
   proxy is configured, and remain a fallback when one is.

A proxy that is down, rate-limited, returns a non-2xx, or returns a
Cloudflare challenge page is treated as failed and the next is tried. There
is no user-facing proxy picker; the chain is fixed in code and tried
automatically. `buildProxyChain()` is a pure, unit-tested function so the
ordering is verified without a live network.

### 3.1 Site adapters

Each source site implements:

```js
{
  id,                        // string
  matches(url),               // -> boolean
  normalizeUrl(url),          // -> info object you define
  chapterUrl(info, n),        // -> URL string for chapter n
  parse(doc, info),           // -> { title, author, summary,
                              //      chapterCount, chapterTitles, chapterHtml }
  searchUrl(keywords, page),  // optional -> URL string
  parseSearchResults(doc),    // optional -> [{ title, author, summary, meta, url }]
}
```

`searchUrl`/`parseSearchResults` are optional; only fanfiction.net
implements them today. Adding a second site is additive — `js/app.js` has no
fanfiction.net-specific logic in it.

### 3.2 Content pipeline

1. User pastes a URL or types keywords into one input (`isUrl()` decides
   which).
2. `fetchHtml()` fetches the page text through a CORS proxy.
3. `toDocument()` parses it into a real DOM via `DOMParser` (so adapter code
   can use `querySelector` instead of regex).
4. The adapter extracts title/author/summary/chapter list, and for the
   chapter body specifically, walks the DOM with a `TreeWalker` and an
   **allowlist** of tags (`P, BR, HR, EM, I, STRONG, B, U, S, BLOCKQUOTE,
   H1–H4, UL, OL, LI, DIV, SPAN, A`), stripping every attribute except
   `href` on links. Anything not on the allowlist is unwrapped (children
   kept, tag discarded); `<script>`/`<style>` are removed outright.
5. The result is injected via `innerHTML` into the reader view.

## 4. Functional requirements

### 4.1 Story loading
- Accepts a fanfiction.net story URL in any chapter (`/s/<id>/<n>/<slug>`);
  normalizes to a canonical `{storyId, chapter, slug}`.
- Loads the requested chapter first, then exposes a chapter dropdown +
  prev/next (top and bottom of the page) built from the chapter-select
  markup on the page, when present.
- One-shot stories (no chapter dropdown in the source markup) fall back to
  a single chapter — this path is exercised against a real one-shot page in
  the test suite, not just inferred from spec reading.
- Each fetched chapter is cached in memory for the session so re-visiting a
  chapter doesn't re-fetch it; the cache is per-load and does not persist
  across reloads.
- Keyboard navigation: ← / → move chapters (ignored while focus is in a
  text input or select).

### 4.2 Search
- A query that isn't a syntactically valid URL is treated as a keyword
  search instead of a load.
- Results render as cards (title, author, summary, metadata line), each
  linking directly into the reader via the existing load path.
- "Load more results" appends the next page using the source site's actual
  pagination parameter (`ppage=`, reverse-engineered from fanfiction.net's
  own client-side search JS — their UI exposes no equivalent of `page=`).
- Only one site's results show at a time; if multiple adapters someday
  implement search, today's code only queries the first one (see §5.4).

### 4.3 Reading settings
- Font size (14–28px), line height (1.4–2.4), theme (light/sepia/dark).
- Settings and the last-loaded URL persist in `localStorage` and are
  restored on next visit (URL is pre-filled, not auto-loaded).

### 4.4 Resilience
- Requests go through the proxy chain described in §3.3 — an optional
  self-hosted proxy first (when configured), then the public proxies in a
  fixed order — with no user-facing picker; a proxy that's down,
  rate-limited, or returns a Cloudflare challenge page is treated as failed
  and the next one is tried automatically.
- If every proxy fails for the same reason (Cloudflare challenge on all of
  them), the error message says so specifically — and points to the
  self-hosted Worker as the mitigation — instead of repeating a generic
  per-proxy failure. Mixed failure types still get a per-proxy breakdown.

## 5. Problems and limitations

This section is the load-bearing part of this document. Several of these
were discovered empirically during development (real Cloudflare challenge
pages, real proxy URL-format quirks) rather than anticipated up front, and
are recorded here so they aren't rediscovered the same way twice.

### 5.1 A proxy is structurally required (but no longer has to be a third party)

fanfiction.net sends no `Access-Control-Allow-Origin` header, so a browser
on a different origin (`creamcheesebagel.github.io`) cannot fetch it
directly — this is enforced by the *source server*, not something
configurable from our side. **Some** proxy is therefore unavoidable for a
static site; what *is* avoidable is depending on someone else's.

The redesign (§3.3) makes the primary proxy a self-hosted Cloudflare Worker
(`worker/fanfic-proxy.js`) when `CUSTOM_PROXY` is set. That is still a proxy,
but it's one the operator controls — no surprise URL-format changes, no
shared shutdown risk, and it doesn't expose user traffic to a third party
(§5.6). It runs on Cloudflare's free tier, so it stays a zero-cost static
deployment with no traditional backend to maintain.

When `CUSTOM_PROXY` is left empty, the app falls back to **public** proxies,
which carry the original caveats — they can change URL format without notice
(codetabs.com already did, mid-project), go down or rate-limit at any time,
and see every URL and query that passes through them (§5.6). The Worker is
the fix for all of that; the public proxies remain a zero-setup default and
a fallback for when the Worker is unreachable.

### 5.2 Cloudflare bot protection can be made less likely, not defeated

fanfiction.net sits behind Cloudflare's managed challenge. Empirically,
this triggers more often on `/search/` than on individual `/s/...` story
pages (plausible explanation: search responses can't be CDN-cached, so
every request gets full bot-detection scrutiny; story pages more often hit
cache and skip it — unconfirmed, but consistent with everything observed
so far).

This was investigated directly: a real same-origin browser request to
fanfiction.net (with session cookies, browser-enforced `Sec-Fetch-*`
headers reflecting genuine navigation) succeeds where a proxied,
cross-origin, credential-less request to the same endpoint gets challenged.
The static client itself **cannot** close that gap:
- `Sec-Fetch-*` headers are forbidden headers — a browser sets them from
  real navigation context and JS cannot override them.
- `credentials: include` on a fetch to a proxy only ever attaches that
  proxy's own cookies, never the source site's, because cookies are
  domain-scoped.
- The actual outbound request to fanfiction.net is made by the proxy, not
  by this app.

The redesign attacks the two factors that *do* move the odds, by shifting
the outbound request to a self-hosted Worker (§3.3): a **dedicated,
clean-reputation IP** instead of a public proxy's heavily-abused shared
pool, and **real browser-like headers** (`User-Agent`, `Accept`,
`Accept-Language`) set server-side where the static client can't. In
practice this is what most often determines whether Cloudflare waves a
request through.

What it still cannot do: **solve** a challenge once issued. If Cloudflare
decides to present a managed JS challenge, a Worker fetch receives the same
"Just a moment…" interstitial, the app detects it (`isCloudflareChallenge`),
and reports it clearly. So the realistic guarantee is "much more likely to
succeed, especially for search," not "always succeeds." Defeating an issued
challenge would require a headless browser solving the JS proof-of-work —
out of scope for a free static site and its lightweight Worker.

### 5.3 Parsing is coupled to fanfiction.net's exact markup

`js/sites/fanfiction.js` selects elements by very specific, somewhat
inconsistent legacy markup: `#profile_top`, a fallback chain for the title
(`b.xcontact` then a bare `#profile_top b`), an author link matched by an
`/\/u\/\d+/` href regex rather than a class (the class differs between the
chapter-page author link and the search-result-card author link), and a
metadata line keyed on `.z-padtop2` specifically — a class name initially
guessed wrong (`.z-padtop`) until corrected against real captured markup.
If fanfiction.net changes this markup, parsing breaks silently or loudly
(usually as "Couldn't find story text on the page," which is also the
message shown for an undetected proxy block) until the adapter is updated
to match. There is no markup-version detection or graceful degradation
beyond that single generic error.

### 5.4 Search is single-adapter only

`runSearch()` calls `searchAdapters()[0]` — the first adapter that
implements search — and stops there. If a second site with search support
is added, results from only one site will ever show; this would need to
become a fan-out-and-merge before it's a real multi-site feature.

### 5.5 No automated test gate before deploy

`tests/parser.test.mjs` exists and is run manually (`npm test`); the
GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys on every
push to `main` with no test step in between. A change that breaks parsing
can reach production if the test suite isn't run by hand first.

Tests also only cover the parsing/fetch-aggregation logic (via real
captured markup fixtures and Playwright network mocking) — there is no
coverage of `js/app.js`'s UI state machine itself (settings panel,
chapter-nav button disabled states, search-result rendering) beyond ad hoc
manual smoke checks performed during development, not codified as
repeatable tests.

### 5.6 Privacy

When the app falls back to **public** proxies, every story URL and search
keyword a user enters passes through a third-party operator (AllOrigins,
corsproxy.io, or codetabs.com) that this project has no relationship with
and no control over — no privacy policy, no insight into logging or
retention, no way to audit it from here.

Configuring the self-hosted Worker (§3.3) removes the third party for the
primary path: traffic goes through infrastructure the operator runs and can
inspect or log on their own terms. It does **not** make requests anonymous
to fanfiction.net itself (the Worker's IP and headers reach the source), and
it doesn't help when the Worker is unreachable and the app falls back to
public proxies. So it's a real privacy improvement for the common case, not
end-to-end anonymity.

### 5.7 Content fidelity

The chapter-body sanitizer is an **allowlist**, not a passthrough — it
exists to keep injected HTML safe and the reading view visually
consistent, but as a side effect it silently drops anything outside that
allowlist: images, tables, and any other formatting an author used that
isn't on the `ALLOWED` tag list (§3.2) disappear with no indication to the
reader that something was removed.

### 5.8 No offline / caching beyond a single tab session

The chapter cache lives in a plain `Map` in page memory. Refreshing the
page, closing the tab, or navigating away and back loses it — every chapter
is re-fetched (through the proxy chain, with all of §5.1–5.2's costs) on
next visit, even for a story just read minutes ago.

### 5.9 No backoff or rate-limit awareness

Rapid chapter navigation (e.g. holding the → key) issues one proxy fetch
per chapter with no debouncing, queuing, or backoff. Heavy use by this
app's users in aggregate is exactly the kind of traffic pattern that gets a
shared public proxy's IP reputation flagged by Cloudflare in the first
place (§5.2) — the app does nothing to self-limit its contribution to that.

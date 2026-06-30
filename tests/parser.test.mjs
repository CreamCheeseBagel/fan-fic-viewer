// Browser-based test for the site adapters.
//
//   npx playwright install chromium   # once
//   node tests/parser.test.mjs

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = readFileSync(join(root, "tests/fixtures/fanfiction-sample.html"), "utf8");
const realFixture = readFileSync(
  join(root, "tests/fixtures/fanfiction-real-chapter.html"),
  "utf8"
);
const searchFixture = readFileSync(
  join(root, "tests/fixtures/fanfiction-search-results.html"),
  "utf8"
);
const cloudflareFixture = readFileSync(
  join(root, "tests/fixtures/cloudflare-challenge.html"),
  "utf8"
);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer((req, res) => {
  try {
    const reqPath = decodeURIComponent(req.url.split("?")[0]);
    const path = reqPath === "/" ? join(root, "index.html") : join(root, reqPath);
    const body = readFileSync(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

await page.goto(`http://localhost:${port}/`);

async function parseFixture(html, url) {
  return page.evaluate(
    async ({ html, url }) => {
      const { adapterFor, toDocument } = await import("/js/sites/index.js");
      const adapter = adapterFor(url);
      const info = adapter.normalizeUrl(url);
      const meta = adapter.parse(toDocument(html), info);
      return { info, meta };
    },
    { html, url }
  );
}

const result = await parseFixture(
  fixture,
  "https://www.fanfiction.net/s/1234567/2/The-Test-Chronicles"
);

const m = result.meta;
const checks = [
  ["title", m.title === "The Test Chronicles"],
  ["author", m.author === "SomeAuthor"],
  ["summary", m.summary === "A summary of the story goes here."],
  ["chapterCount", m.chapterCount === 3],
  ["chapterTitles", JSON.stringify(m.chapterTitles) === JSON.stringify(["Beginnings", "The Middle", "The End"])],
  ["chapter parsed from url", result.info.chapter === 2],
  ["script stripped", !/alert/.test(m.chapterHtml)],
  ["style attr stripped", !/style=/.test(m.chapterHtml)],
  ["onclick stripped", !/onclick/.test(m.chapterHtml)],
  ["href preserved", /href="http:\/\/evil"/.test(m.chapterHtml)],
  ["inline formatting preserved", /<em>world<\/em>/.test(m.chapterHtml)],
  ["disallowed tag unwrapped", !/<table/.test(m.chapterHtml) && /unwrap me/.test(m.chapterHtml)],
];

// Real fanfiction.net markup: no .xcontact class on the title <b>, unclosed
// <option> tags, and a profile_top full of unrelated xcontrast_txt elements
// the summary selector must skip past.
const realResult = await parseFixture(
  realFixture,
  "https://www.fanfiction.net/s/11029690/4/The-Doctor-Who-Drabble-Files"
);
const rm = realResult.meta;
checks.push(
  ["real: title", rm.title === "The Doctor Who Drabble Files"],
  ["real: author", rm.author === "badly-knitted"],
  ["real: summary", rm.summary.startsWith("My third drabble collection")],
  ["real: chapterCount", rm.chapterCount === 5],
  ["real: chapter parsed from url", realResult.info.chapter === 4],
  ["real: story text extracted", /Travelling with the Doctor/.test(rm.chapterHtml)]
);

// Real fanfiction.net search-results markup: confirms .z-padtop2 (not
// .z-padtop) holds the metadata line, and that a highlighted match wrapped
// onto its own line ("<b>Rabbot</b>\n  Tale") still extracts as one title.
const searchResults = await page.evaluate(async (html) => {
  const { searchAdapters, toDocument } = await import("/js/sites/index.js");
  const adapter = searchAdapters()[0];
  return adapter.parseSearchResults(toDocument(html));
}, searchFixture);

checks.push(
  ["search: result count", searchResults.length === 2],
  ["search: inline-highlight title", searchResults[0]?.title === "MEGATRON VS THE RABBOT"],
  ["search: wrapped-highlight title", searchResults[1]?.title === "Rabbot Tale"],
  ["search: author", searchResults[1]?.author === "bunnikkila"],
  ["search: url resolved absolute", searchResults[1]?.url === "https://www.fanfiction.net/s/4913618/1/Rabbot-Tale"],
  [
    "search: summary excludes meta line",
    searchResults[1]?.summary ===
      "A SatAM-based fanfic detailing Bunnie's partial roboticization - and Antoine's resulting feelings of guilt.",
  ],
  ["search: meta captured separately", searchResults[1]?.meta.startsWith("Sonic the Hedgehog - Rated: K+")]
);

// Cloudflare interstitial detection: a real "Just a moment..." page must be
// flagged, while real content (chapter or search results) must not be.
const cloudflareChecks = await page.evaluate(
  async ({ challenge, chapter, search }) => {
    const { isCloudflareChallenge } = await import("/js/fetcher.js");
    return {
      challenge: isCloudflareChallenge(challenge),
      chapter: isCloudflareChallenge(chapter),
      search: isCloudflareChallenge(search),
    };
  },
  { challenge: cloudflareFixture, chapter: realFixture, search: searchFixture }
);
checks.push(
  ["cloudflare: challenge page detected", cloudflareChecks.challenge === true],
  ["cloudflare: real chapter not flagged", cloudflareChecks.chapter === false],
  ["cloudflare: real search results not flagged", cloudflareChecks.search === false]
);

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) ok = false;
}

await browser.close();
server.close();
console.log(ok ? "\nAll checks passed." : "\nSome checks FAILED.");
process.exit(ok ? 0 : 1);

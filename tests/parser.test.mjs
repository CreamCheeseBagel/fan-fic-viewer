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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer((req, res) => {
  try {
    const path = join(root, decodeURIComponent(req.url.split("?")[0]));
    const body = readFileSync(path === root ? join(root, "index.html") : path);
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

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) ok = false;
}

await browser.close();
server.close();
console.log(ok ? "\nAll checks passed." : "\nSome checks FAILED.");
process.exit(ok ? 0 : 1);

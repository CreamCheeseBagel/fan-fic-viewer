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

const result = await page.evaluate(async (html) => {
  const { adapterFor, toDocument } = await import("/js/sites/index.js");
  const url = "https://www.fanfiction.net/s/1234567/2/The-Test-Chronicles";
  const adapter = adapterFor(url);
  const info = adapter.normalizeUrl(url);
  const meta = adapter.parse(toDocument(html), info);
  return { info, meta };
}, fixture);

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

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) ok = false;
}

await browser.close();
server.close();
console.log(ok ? "\nAll checks passed." : "\nSome checks FAILED.");
process.exit(ok ? 0 : 1);

import { fetchHtml, PROXIES } from "./fetcher.js";
import { adapterFor, toDocument } from "./sites/index.js";

const SETTINGS_KEY = "ffv:settings";
const LAST_URL_KEY = "ffv:lastUrl";

const DEFAULT_SETTINGS = {
  fontSize: 19,
  lineHeight: 17,
  theme: "light",
  proxy: PROXIES[0].id,
};

const els = {
  form: document.getElementById("load-form"),
  urlInput: document.getElementById("url-input"),
  loadBtn: document.getElementById("load-btn"),
  intro: document.getElementById("intro"),
  status: document.getElementById("status"),
  story: document.getElementById("story"),
  title: document.getElementById("story-title"),
  author: document.getElementById("story-author"),
  summary: document.getElementById("story-summary"),
  content: document.getElementById("chapter-content"),
  chapterSelect: document.getElementById("chapter-select"),
  prev: document.getElementById("prev-chapter"),
  next: document.getElementById("next-chapter"),
  prev2: document.getElementById("prev-chapter-2"),
  next2: document.getElementById("next-chapter-2"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsPanel: document.getElementById("settings-panel"),
  closeSettings: document.getElementById("close-settings"),
  fontSize: document.getElementById("font-size"),
  lineHeight: document.getElementById("line-height"),
  themeSelect: document.getElementById("theme-select"),
  proxySelect: document.getElementById("proxy-select"),
  openSettingsIntro: document.getElementById("open-settings-intro"),
};

let settings = loadSettings();
let current = null;

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  document.documentElement.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
  document.documentElement.style.setProperty("--reader-line-height", String(1 + settings.lineHeight / 10));
  document.documentElement.setAttribute("data-theme", settings.theme);
  els.fontSize.value = settings.fontSize;
  els.lineHeight.value = settings.lineHeight;
  els.themeSelect.value = settings.theme;
  els.proxySelect.value = settings.proxy;
}

function initProxyOptions() {
  els.proxySelect.innerHTML = "";
  for (const p of PROXIES) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    els.proxySelect.appendChild(opt);
  }
}

function showStatus(html, isError = false) {
  els.status.hidden = false;
  els.status.classList.toggle("error", isError);
  els.status.innerHTML = html;
}
function hideStatus() { els.status.hidden = true; }

async function loadStory(url) {
  const adapter = adapterFor(url);
  if (!adapter) {
    showStatus("Unsupported site. Right now only <code>fanfiction.net</code> links work.", true);
    return;
  }

  let info;
  try {
    info = adapter.normalizeUrl(url);
  } catch (err) {
    showStatus(escapeHtml(err.message), true);
    return;
  }

  els.story.hidden = true;
  els.intro.hidden = true;
  els.loadBtn.disabled = true;
  showStatus(`<span class="spinner"></span>Loading story…`);

  try {
    const firstUrl = adapter.chapterUrl(info, info.chapter || 1);
    const html = await fetchHtml(firstUrl, settings.proxy);
    const doc = toDocument(html);
    const meta = adapter.parse(doc, info);

    current = {
      adapter,
      info,
      meta,
      chapterCache: new Map([[info.chapter || 1, meta.chapterHtml]]),
    };

    localStorage.setItem(LAST_URL_KEY, url);
    renderStoryShell();
    await showChapter(info.chapter || 1);
    hideStatus();
  } catch (err) {
    showStatus(escapeHtml(err.message), true);
  } finally {
    els.loadBtn.disabled = false;
  }
}

function renderStoryShell() {
  const { meta } = current;
  els.title.textContent = meta.title;
  els.author.textContent = meta.author ? `by ${meta.author}` : "";
  els.summary.textContent = meta.summary || "";

  els.chapterSelect.innerHTML = "";
  for (let i = 0; i < meta.chapterCount; i++) {
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = `${i + 1}. ${meta.chapterTitles[i] || ""}`.trim();
    els.chapterSelect.appendChild(opt);
  }
  els.story.hidden = false;
}

async function showChapter(n) {
  const { adapter, info, meta, chapterCache } = current;
  n = Math.min(Math.max(1, n), meta.chapterCount);

  els.chapterSelect.value = String(n);
  updateNavButtons(n);

  let html = chapterCache.get(n);
  if (html == null) {
    showStatus(`<span class="spinner"></span>Loading chapter ${n}…`);
    try {
      const raw = await fetchHtml(adapter.chapterUrl(info, n), settings.proxy);
      const parsed = adapter.parse(toDocument(raw), info);
      html = parsed.chapterHtml;
      chapterCache.set(n, html);
      hideStatus();
    } catch (err) {
      showStatus(escapeHtml(err.message), true);
      return;
    }
  }

  els.content.innerHTML = html;
  info.chapter = n;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateNavButtons(n) {
  const atStart = n <= 1;
  const atEnd = n >= current.meta.chapterCount;
  els.prev.disabled = els.prev2.disabled = atStart;
  els.next.disabled = els.next2.disabled = atEnd;
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = els.urlInput.value.trim();
  if (url) loadStory(url);
});

function goPrev() { if (current) showChapter((current.info.chapter || 1) - 1); }
function goNext() { if (current) showChapter((current.info.chapter || 1) + 1); }
els.prev.addEventListener("click", goPrev);
els.prev2.addEventListener("click", goPrev);
els.next.addEventListener("click", goNext);
els.next2.addEventListener("click", goNext);
els.chapterSelect.addEventListener("change", (e) => showChapter(parseInt(e.target.value, 10)));

document.addEventListener("keydown", (e) => {
  if (els.story.hidden) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === "ArrowLeft") goPrev();
  if (e.key === "ArrowRight") goNext();
});

function openSettings() { els.settingsPanel.hidden = false; }
function closeSettings() { els.settingsPanel.hidden = true; }
els.settingsToggle.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.openSettingsIntro.addEventListener("click", openSettings);
els.settingsPanel.addEventListener("click", (e) => { if (e.target === els.settingsPanel) closeSettings(); });

els.fontSize.addEventListener("input", (e) => { settings.fontSize = parseInt(e.target.value, 10); applySettings(); saveSettings(); });
els.lineHeight.addEventListener("input", (e) => { settings.lineHeight = parseInt(e.target.value, 10); applySettings(); saveSettings(); });
els.themeSelect.addEventListener("change", (e) => { settings.theme = e.target.value; applySettings(); saveSettings(); });
els.proxySelect.addEventListener("change", (e) => { settings.proxy = e.target.value; saveSettings(); });

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

initProxyOptions();
applySettings();

const lastUrl = localStorage.getItem(LAST_URL_KEY);
if (lastUrl) els.urlInput.value = lastUrl;

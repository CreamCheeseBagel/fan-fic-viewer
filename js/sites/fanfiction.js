export const fanfictionAdapter = {
  id: "fanfiction.net",

  matches(url) {
    return /(^|\.)fanfiction\.net$/i.test(safeHost(url));
  },

  normalizeUrl(url) {
    const m = url.match(/\/s\/(\d+)(?:\/(\d+))?(?:\/([^/?#]+))?/i);
    if (!m) {
      throw new Error(
        "That doesn't look like a fanfiction.net story URL. Expected a link " +
          "like https://www.fanfiction.net/s/1234567/1/Story-Title"
      );
    }
    return {
      storyId: m[1],
      chapter: m[2] ? parseInt(m[2], 10) : 1,
      slug: m[3] || "",
    };
  },

  chapterUrl(info, n) {
    const slug = info.slug ? `/${info.slug}` : "";
    return `https://www.fanfiction.net/s/${info.storyId}/${n}${slug}`;
  },

  parse(doc, info) {
    const top = doc.querySelector("#profile_top");

    const title =
      text(top && top.querySelector("b.xcontact")) ||
      text(doc.querySelector("#profile_top b")) ||
      "Untitled story";

    let author = "";
    if (top) {
      const authorLink = Array.from(top.querySelectorAll("a")).find((a) =>
        /\/u\/\d+/.test(a.getAttribute("href") || "")
      );
      author = text(authorLink);
    }

    const summary = text(top && top.querySelector("div.xcontrast_txt"));

    const chapterTitles = [];
    let chapterCount = 1;
    const select = doc.querySelector("#chap_select");
    if (select) {
      const options = Array.from(select.querySelectorAll("option"));
      if (options.length) {
        chapterCount = options.length;
        for (const opt of options) {
          chapterTitles.push(text(opt).replace(/^\s*\d+\.\s*/, ""));
        }
      }
    }
    if (!chapterTitles.length) chapterTitles.push(title);

    const storyEl = doc.querySelector("#storytext");
    if (!storyEl) {
      throw new Error(
        "Couldn't find story text on the page. The source markup may have " +
          "changed, or the proxy returned a block/challenge page."
      );
    }

    return {
      title,
      author,
      summary,
      chapterCount,
      chapterTitles,
      chapterHtml: cleanChapter(storyEl),
    };
  },
};

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function text(el) {
  return el ? el.textContent.trim() : "";
}

const ALLOWED = new Set([
  "P", "BR", "HR", "EM", "I", "STRONG", "B", "U", "S",
  "BLOCKQUOTE", "H1", "H2", "H3", "H4", "UL", "OL", "LI", "DIV", "SPAN", "A",
]);

function cleanChapter(root) {
  const clone = root.cloneNode(true);
  const walker = clone.ownerDocument.createTreeWalker(
    clone,
    NodeFilter.SHOW_ELEMENT
  );
  const toUnwrap = [];
  const toStrip = [];

  let node = walker.nextNode();
  while (node) {
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      toStrip.push(node);
    } else if (!ALLOWED.has(node.tagName)) {
      toUnwrap.push(node);
    } else {
      const href = node.tagName === "A" ? node.getAttribute("href") : null;
      for (const attr of Array.from(node.attributes)) {
        node.removeAttribute(attr.name);
      }
      if (href) node.setAttribute("href", href);
    }
    node = walker.nextNode();
  }

  for (const el of toStrip) el.remove();
  for (const el of toUnwrap) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
  }

  return clone.innerHTML;
}

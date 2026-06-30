import { fanfictionAdapter } from "./fanfiction.js";

export const ADAPTERS = [fanfictionAdapter];

export function adapterFor(url) {
  return ADAPTERS.find((a) => a.matches(url)) || null;
}

export function searchAdapters() {
  return ADAPTERS.filter((a) => a.searchUrl && a.parseSearchResults);
}

export function toDocument(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

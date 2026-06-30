import { fanfictionAdapter } from "./fanfiction.js";

export const ADAPTERS = [fanfictionAdapter];

export function adapterFor(url) {
  return ADAPTERS.find((a) => a.matches(url)) || null;
}

export function toDocument(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

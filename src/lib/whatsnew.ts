export const WHATSNEW_EVENT = "macroai:whatsnew";

/** Open the What's New popup immediately, from anywhere, without a reload. */
export function openWhatsNew() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WHATSNEW_EVENT));
  }
}

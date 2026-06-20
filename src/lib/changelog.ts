export interface ChangelogEntry {
  /** monotonically increasing; used to decide what's "new" for a user */
  build: number;
  version: string;
  date: string;
  title: string;
  items: string[];
}

// Newest first. Bump `build` whenever you want the popup to show again.
export const CHANGELOG: ChangelogEntry[] = [
  {
    build: 3,
    version: "1.2",
    date: "2026-06-20",
    title: "Accuracy, history & more control",
    items: [
      "Search a real food database (Open Food Facts) for exact macros.",
      "Scan product barcodes to log packaged foods instantly.",
      "Log to any day — swipe between dates on the Today screen.",
      "Quick-add your recent foods with one tap.",
      "Meals are now grouped (breakfast / lunch / dinner / snacks).",
      "Track your daily water glasses.",
      "Backup & restore your data from Settings (move between phones).",
      "Pick your timezone so your “day” starts and ends correctly.",
    ],
  },
  {
    build: 2,
    version: "1.1",
    date: "2026-06-20",
    title: "Smarter, faster logging",
    items: [
      "Describe meals in words — no photo needed (e.g. “50g banana, 2 eggs”).",
      "Take a photo or upload one from your gallery.",
      "Smarter AI estimates with a confidence level and a calorie range per item.",
      "Tap any logged item to edit its name, grams, or macros.",
      "Set your own daily calorie & macro targets in Settings.",
      "Fixed number fields that wouldn’t let you clear the 0.",
    ],
  },
  {
    build: 1,
    version: "1.0",
    date: "2026-06-19",
    title: "Welcome to MacroAI",
    items: [
      "Photo calorie scanning, adaptive targets, weight tracking, and trends.",
      "Installable as an app on your phone.",
    ],
  },
];

export const CURRENT_BUILD = CHANGELOG[0].build;

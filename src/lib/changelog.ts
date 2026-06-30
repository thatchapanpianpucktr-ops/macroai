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
    build: 10,
    version: "1.9",
    date: "2026-06-30",
    title: "Chat with the AI + sharper estimates",
    items: [
      "New: tap “Discuss with AI” on any scan or logged item to chat — disagree, ask “why so many calories?”, or say “make the rice smaller” and it explains and adjusts.",
      "On a logged item you can also attach a leftovers photo in chat and talk through how much you actually ate.",
      "Changes preview live; nothing is saved until you hit Save — and your conversation is kept with the item.",
      "Scans now log as one combined entry by default, auto-named after the food (untick to split) — no more forgetting to group.",
      "More accurate scans: the AI now reasons step-by-step before giving numbers, and photos are sent in higher resolution.",
    ],
  },
  {
    build: 9,
    version: "1.8",
    date: "2026-06-30",
    title: "Smarter AI scanning",
    items: [
      "Upgraded to Google’s latest Gemini 3.5 Flash for more accurate food recognition and macro estimates.",
      "If your key ever hits its limit, the app automatically falls back to earlier models so scanning keeps working.",
    ],
  },
  {
    build: 8,
    version: "1.7",
    date: "2026-06-21",
    title: "Group items your way",
    items: [
      "After a scan, combine the AI’s sub-items into one entry — e.g. group all the bento parts as “Bento box” while your coffee stays separate.",
      "Use “Combine all” for a single item, or set each item’s group with the “Part of” picker.",
      "A preview shows exactly what will be logged before you save.",
    ],
  },
  {
    build: 7,
    version: "1.6",
    date: "2026-06-21",
    title: "“I didn’t finish it”",
    items: [
      "Tap any logged item → choose how much you actually ate (¼, ⅓, ½, ⅔, ¾, all) to instantly scale calories & macros.",
      "Or snap a photo of your leftovers (with an optional note) and the AI estimates how much you ate and subtracts the rest.",
      "You can also just type “left half” or “a few bites” and let the AI adjust it.",
    ],
  },
  {
    build: 6,
    version: "1.5",
    date: "2026-06-20",
    title: "Bring your own AI key",
    items: [
      "Photo & describe scanning now needs your own free Google Gemini key — no more shared key.",
      "Add it in the popup or Settings; it stays on your device and gives you your own quota.",
      "Search & barcode logging still work with no key at all.",
    ],
  },
  {
    build: 5,
    version: "1.4",
    date: "2026-06-20",
    title: "Use your own AI key",
    items: [
      "Add your own free Google Gemini key in Settings to get your own scanning quota.",
      "Your key is stored only on your device and is never included in backups.",
      "No key? The app still works on a shared key — and Search & barcode never need one.",
    ],
  },
  {
    build: 4,
    version: "1.3",
    date: "2026-06-20",
    title: "Multi-photo scanning",
    items: [
      "Add several photos to one scan — e.g. the front, the back, and the nutrition label.",
      "Works for both the camera and gallery uploads; they’re analyzed together as one item.",
      "The AI reads visible nutrition labels for more accurate numbers.",
    ],
  },
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

# MacroAI Backlog

Ideas and features parked for later. Pick one up when ready.

---

## Gym reminders + calendar sync

**What**: Remind the user of planned gym days and keep the split on their phone calendar.

**Reminders**
- Local notification when a session is planned for today
- Optional evening nudge if no completed/skipped log
- iOS PWAs have limited notification support — may need a native shell (Capacitor) later

**Calendar**
- Export planned week as `.ics` for Google/Apple Calendar import
- Later: Google Calendar OAuth to create/update events; refresh when coach adapts after a skip
- `GymPlan.daysPerWeek` + `template` already support generating dated planned slots

---

## 🖼️ Keep photo with logged food entry (viewable after saving)

**What**: After scanning a photo, the image is currently discarded. We want users to be able to tap a logged food entry and see the original photo.

**Why not localStorage**: The food log, settings, and weight data all live in localStorage (~5–10 MB limit). Storing images there would fill it up within weeks.

**Recommended approach: Cloudinary (free)**
- Sign up at https://cloudinary.com — free tier gives 25 GB storage + 25 GB bandwidth/month (no credit card)
- Browser uploads the photo directly to Cloudinary after a scan
- The returned URL (~80 chars) is saved as `imageUrl` on the `FoodEntry` instead of a base64 blob
- `FoodEditSheet` loads the image from the URL when the user taps a logged item

**Alternative: Vercel Blob**
- Already integrated with the Vercel project, no new account needed
- Free tier: 500 MB (≈ 5,000 photos at 100 KB each)
- Upload goes through an API route instead of directly from the browser

**Files to touch when implementing**:
- `src/lib/types.ts` — add `imageUrl?: string` to `FoodEntry`
- `src/components/FoodScanner.tsx` — upload image after scan, store URL
- `src/components/FoodEditSheet.tsx` — show image if `imageUrl` is present
- `src/app/api/upload/route.ts` — new route (only needed for Vercel Blob option)
- `src/lib/store.ts` — no change needed (URL is just a string field)

**Notes**:
- Images will be publicly accessible via their URL — fine for personal food photos
- Old images should be deleted from the cloud when a food entry is deleted (optional cleanup)
- The existing 120px `thumb` in localStorage can stay as the list-view thumbnail; `imageUrl` is only for the full tap-to-view experience

---

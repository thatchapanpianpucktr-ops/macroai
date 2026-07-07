/** Persists an unanalyzed photo session to localStorage so the user can
 *  resume after closing the app. Draft auto-expires after 24 hours. */

const DRAFT_KEY = "macroai.photoDraft.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PendingPhoto {
  base64: string;
  mimeType: string;
  thumb: string;
}

interface PhotoDraft {
  photos: PendingPhoto[];
  hint: string;
  savedAt: number;
}

export function saveDraft(photos: PendingPhoto[], hint: string): void {
  if (typeof window === "undefined" || photos.length === 0) return;
  try {
    const draft: PhotoDraft = { photos, hint, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort — ignore quota errors silently.
  }
}

export function loadDraft(): PhotoDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as PhotoDraft;
    if (!Array.isArray(draft.photos) || draft.photos.length === 0) return null;
    if (Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

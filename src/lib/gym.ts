import type {
  CardioBlock,
  LoadMode,
  SplitTag,
  WorkoutSession,
  WorkoutSet,
} from "./types";

/** Infer load mode from exercise name (user/AI can override). */
export function inferLoadMode(name: string): LoadMode {
  const n = name.toLowerCase();
  if (
    /\b(assisted|assist)\b/.test(n) ||
    /\bband\b/.test(n)
  ) {
    return "assisted";
  }
  if (
    /\b(dip|dips|pull-?ups?|chin-?ups?|push-?ups?|sit-?ups?|plank|burpee|muscle-?up)s?\b/.test(
      n,
    )
  ) {
    return "bodyweight";
  }
  return "weighted";
}

export type ExerciseMemoryEntry = {
  name: string;
  loadMode: LoadMode;
  lastWeightKg?: number;
  lastReps?: number;
  bestReps?: number;
  lastAssistanceKg?: number;
  lastAddedKg?: number;
  lastDate?: string;
};

/** Latest known numbers per exercise name (case-insensitive). */
export function buildExerciseMemory(
  sessions: WorkoutSession[],
): ExerciseMemoryEntry[] {
  const map = new Map<string, ExerciseMemoryEntry>();
  // sessions are newest-first typically; walk oldest→newest so last write wins
  const ordered = [...sessions]
    .filter((s) => s.status === "completed")
    .sort(
      (a, b) =>
        new Date(a.createdAt || a.date).getTime() -
        new Date(b.createdAt || b.date).getTime(),
    );

  for (const s of ordered) {
    for (const ex of s.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      const top = pickTopSet(ex.sets);
      const prev = map.get(key);
      const bestReps = Math.max(
        prev?.bestReps ?? 0,
        ...ex.sets.map((set) => set.reps || 0),
      );
      map.set(key, {
        name: ex.name.trim(),
        loadMode: ex.loadMode || inferLoadMode(ex.name),
        lastWeightKg: top?.weightKg ?? prev?.lastWeightKg,
        lastReps: top?.reps ?? prev?.lastReps,
        bestReps: bestReps || prev?.bestReps,
        lastAssistanceKg: top?.assistanceKg ?? prev?.lastAssistanceKg,
        lastAddedKg: top?.addedKg ?? prev?.lastAddedKg,
        lastDate: s.date,
      });
    }
  }
  return Array.from(map.values());
}

function pickTopSet(sets: WorkoutSet[]): WorkoutSet | undefined {
  if (!sets?.length) return undefined;
  return [...sets].sort((a, b) => {
    const aw = a.weightKg ?? a.addedKg ?? 0;
    const bw = b.weightKg ?? b.addedKg ?? 0;
    if (bw !== aw) return bw - aw;
    return (b.reps || 0) - (a.reps || 0);
  })[0];
}

/** Compact history for Gemini context (keeps tokens down). */
export function compactWorkoutHistory(
  sessions: WorkoutSession[],
  limit = 30,
): unknown[] {
  return sessions.slice(0, limit).map((s) => ({
    date: s.date,
    split: s.split,
    status: s.status,
    estimatedKcal: s.estimatedKcal,
    cardio: s.cardio
      ? {
          type: s.cardio.type,
          minutes: s.cardio.minutes,
          intensity: s.cardio.intensity,
        }
      : undefined,
    exercises:
      s.status === "completed"
        ? (s.exercises ?? []).map((ex) => {
            const top = pickTopSet(ex.sets);
            return {
              name: ex.name,
              loadMode: ex.loadMode,
              sets: ex.sets?.length ?? 0,
              top:
                top &&
                (ex.loadMode === "weighted"
                  ? `${top.weightKg ?? "?"}kg x ${top.reps}`
                  : ex.loadMode === "assisted"
                    ? `${top.reps} reps (assist ${top.assistanceKg ?? "?"}kg)`
                    : `${top.reps} reps${top.addedKg ? ` +${top.addedKg}kg` : ""}`),
            };
          })
        : [],
  }));
}

/** Rough local kcal estimate when Gemini is unavailable. */
export function estimateWorkoutKcalLocal(
  session: Pick<WorkoutSession, "exercises" | "cardio" | "status">,
  bodyweightKg = 75,
): number {
  if (session.status === "skipped") return 0;
  let kcal = 0;
  const sets = (session.exercises ?? []).reduce(
    (n, ex) => n + (ex.sets?.length || 0),
    0,
  );
  // ~5–6 kcal per working set as a blunt volume heuristic
  kcal += Math.round(sets * 5.5);

  if (session.cardio) {
    kcal += estimateCardioKcalLocal(session.cardio, bodyweightKg);
  }
  return Math.max(0, kcal);
}

export function estimateCardioKcalLocal(
  cardio: CardioBlock,
  bodyweightKg = 75,
): number {
  const minutes = Math.max(0, cardio.minutes || 0);
  if (!minutes) return 0;
  const intensity = cardio.intensity ?? "moderate";
  // MET-ish multipliers relative to bodyweight
  const met =
    intensity === "easy" ? 4 : intensity === "hard" ? 9 : 6.5;
  // kcal ≈ MET * kg * hours
  return Math.round(met * bodyweightKg * (minutes / 60));
}

export function estimateStepsKcal(steps: number, bodyweightKg = 75): number {
  if (!steps || steps <= 0) return 0;
  // ~0.04–0.05 kcal per step scaled lightly by bodyweight vs 70kg
  return Math.round(steps * 0.04 * (bodyweightKg / 70));
}

export function normalizeSplit(raw: unknown): SplitTag {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  const allowed: SplitTag[] = [
    "push",
    "pull",
    "legs",
    "upper",
    "lower",
    "full",
    "cardio",
    "other",
  ];
  return (allowed.includes(s as SplitTag) ? s : "other") as SplitTag;
}

export function normalizeLoadMode(raw: unknown, name: string): LoadMode {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (s === "weighted" || s === "bodyweight" || s === "assisted") return s;
  return inferLoadMode(name);
}

export function prefillSetsFromMemory(
  name: string,
  loadMode: LoadMode,
  memory: ExerciseMemoryEntry[],
  setCount = 3,
): WorkoutSet[] {
  const mem = memory.find(
    (m) => m.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const reps = mem?.lastReps ?? (loadMode === "weighted" ? 10 : 12);
  const base: WorkoutSet = { reps };
  if (loadMode === "weighted" && mem?.lastWeightKg != null) {
    base.weightKg = mem.lastWeightKg;
  }
  if (loadMode === "assisted" && mem?.lastAssistanceKg != null) {
    base.assistanceKg = mem.lastAssistanceKg;
  }
  if (
    (loadMode === "bodyweight" || loadMode === "assisted") &&
    mem?.lastAddedKg != null
  ) {
    base.addedKg = mem.lastAddedKg;
  }
  return Array.from({ length: Math.max(1, setCount) }, () => ({ ...base }));
}
import { inferLoadMode, type ExerciseMemoryEntry } from "./gym";
import type {
  CardioBlock,
  LoadMode,
  WorkoutExercise,
  WorkoutSet,
} from "./types";

export type ParsedSetLine = {
  name: string;
  loadMode: LoadMode;
  reps: number;
  weightKg?: number;
  addedKg?: number;
  assistanceKg?: number;
  setIndex?: number;
  repeat?: number;
};

export type LastSetContext = {
  name: string;
  loadMode: LoadMode;
  weightKg?: number;
  addedKg?: number;
  assistanceKg?: number;
  lastSetIndex: number;
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const SKIP_IF_NO_NUMBERS =
  /^(what|why|how|should|can you|could you|please (plan|suggest|tell)|today i(?:'m| am) (hitting|doing|training)|i skipped|progress)/i;

function toKg(n: number, unit?: string): number {
  const u = (unit ?? "kg").toLowerCase();
  if (u === "lb" || u === "lbs" || u === "pound" || u === "pounds") {
    return Math.round(n * 0.453592 * 10) / 10;
  }
  return n;
}

function depluralize(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ss")) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (
    w.endsWith("oes") ||
    w.endsWith("xes") ||
    w.endsWith("zes") ||
    w.endsWith("ches") ||
    w.endsWith("shes") ||
    w.endsWith("ses")
  ) {
    return w.slice(0, -2);
  }
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(depluralize)
    .join(" ");
}

function stripSetMarker(text: string): { text: string; setIndex?: number } {
  let setIndex: number | undefined;
  const next = text.replace(/\bsets?\s*(\d+)\b/gi, (_, n: string) => {
    setIndex = Number(n);
    return " ";
  });
  return { text: next.replace(/\s+/g, " ").trim(), setIndex };
}

function cleanName(raw: string): string {
  return raw
    .replace(
      /\b(set|sets|rep|reps|kg|kilos|kilo|lbs?|pounds?|at|@|x|×)\b/gi,
      " ",
    )
    .replace(/\b\d+\s*$/g, " ")
    .replace(/[|:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCardio(text: string): CardioBlock | null {
  const s = text.toLowerCase().replace(/,/g, " ");
  const cue =
    /\b(cardio|incline\s*walk|treadmill|walk(?:ing)?|run(?:ning)?|jog(?:ging)?|cycl(?:e|ing)|bike|row(?:ing)?|stair|hiit|elliptical)\b/.test(
      s,
    );
  const minM = s.match(/(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)\b/);
  if (!cue || !minM) return null;
  const minutes = Number(minM[1]);
  if (!(minutes > 0) || minutes > 300) return null;

  const inclineM = s.match(
    /(?:incline|grade)\s*(\d+(?:\.\d+)?)(?:\s*%)?|(\d+(?:\.\d+)?)\s*%/,
  );
  const speedM = s.match(
    /(\d+(?:\.\d+)?)\s*(?:km\/h|kph|kmh)|speed\s*(\d+(?:\.\d+)?)/,
  );
  const distM = s.match(/(\d+(?:\.\d+)?)\s*km(?!\s*\/)/);
  const intensity: CardioBlock["intensity"] = /\b(easy|light)\b/.test(s)
    ? "easy"
    : /\b(hard|fast|vigorous)\b/.test(s)
      ? "hard"
      : /\b(moderate|mod)\b/.test(s)
        ? "moderate"
        : undefined;

  let type = "cardio";
  if (/incline\s*walk|treadmill/.test(s)) type = "incline walk";
  else if (/\bjog/.test(s)) type = "jog";
  else if (/\brun/.test(s)) type = "run";
  else if (/\b(bike|cycl)/.test(s)) type = "bike";
  else if (/\brow/.test(s)) type = "row";
  else if (/\bstair/.test(s)) type = "stairs";
  else if (/\bwalk/.test(s)) type = "walk";
  else if (/\bhiit/.test(s)) type = "hiit";
  else if (/\belliptical/.test(s)) type = "elliptical";

  const inclinePct = inclineM
    ? Number(inclineM[1] || inclineM[2])
    : undefined;
  const speedKmh = speedM ? Number(speedM[1] || speedM[2]) : undefined;
  const distanceKm = distM
    ? Number(distM[1])
    : speedKmh
      ? Math.round(speedKmh * (minutes / 60) * 100) / 100
      : undefined;

  return {
    type,
    minutes,
    ...(inclinePct != null && !Number.isNaN(inclinePct)
      ? { inclinePct }
      : {}),
    ...(speedKmh != null && !Number.isNaN(speedKmh) ? { speedKmh } : {}),
    ...(distanceKm != null && !Number.isNaN(distanceKm)
      ? { distanceKm }
      : {}),
    ...(intensity ? { intensity } : {}),
  };
}

export function mergeCardio(
  prev: CardioBlock | undefined,
  next: CardioBlock | undefined,
): CardioBlock | undefined {
  if (!next) return prev;
  if (!prev) return next;
  return {
    type: next.type || prev.type,
    minutes: next.minutes || prev.minutes,
    inclinePct: next.inclinePct ?? prev.inclinePct,
    speedKmh: next.speedKmh ?? prev.speedKmh,
    distanceKm: next.distanceKm ?? prev.distanceKm,
    intensity: next.intensity ?? prev.intensity,
    estimatedKcal: next.estimatedKcal ?? prev.estimatedKcal,
  };
}

export function formatCardio(cardio: CardioBlock): string {
  const bits = [`${cardio.minutes} min ${cardio.type}`];
  if (cardio.inclinePct != null) bits.push(`${cardio.inclinePct}% incline`);
  if (cardio.speedKmh != null) bits.push(`${cardio.speedKmh} km/h`);
  if (cardio.intensity) bits.push(cardio.intensity);
  if (cardio.estimatedKcal) bits.push(`~${cardio.estimatedKcal} kcal`);
  return bits.join(" · ");
}

function isFillerName(name: string): boolean {
  const key = nameKey(name);
  if (!key) return true;
  return key
    .split(" ")
    .every((w) =>
      /^(same|weight|load|kg|next|another|more|set|rep|nd|st|rd|th)$/.test(w),
    );
}

function looksLikeExercise(name: string): boolean {
  if (name.length < 2 || name.length > 48) return false;
  if (/^\d+$/.test(name)) return false;
  if (isFillerName(name)) return false;
  return !/^(today|workout|session|gym|done|finished|logged|and|the|a|an)$/i.test(
    name,
  );
}

function extractSetOrdinal(text: string): number | undefined {
  const nth = text.match(/\b(\d+)(?:st|nd|rd|th)\s*(?:set)?\b/i);
  if (nth) return Number(nth[1]);
  const word = text.match(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*(?:set)?\b/i,
  );
  if (word) return ORDINAL_WORDS[word[1].toLowerCase()];
  const setN = text.match(/\bsets?\s*(\d+)\b/i);
  if (setN) return Number(setN[1]);
  return undefined;
}

function leftoverExerciseName(text: string): string {
  return cleanName(
    text
      .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
      .replace(
        /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
        " ",
      )
      .replace(/\bsets?\s*\d+\b/gi, " ")
      .replace(
        /\b(next|another|same|weight|load|one more|as before)\b/gi,
        " ",
      )
      .replace(/\b\d+(?:\.\d+)?\s*(kg|kilos?|lbs?|pounds?)\b/gi, " ")
      .replace(/\b\d+\s*reps?\b/gi, " ")
      .replace(/\b\d+\s*$/g, " "),
  );
}

function copyLoad(
  line: ParsedSetLine,
  src: Pick<LastSetContext, "weightKg" | "addedKg" | "assistanceKg" | "loadMode">,
): ParsedSetLine {
  if (src.weightKg != null) return { ...line, weightKg: src.weightKg };
  if (src.addedKg != null) return { ...line, addedKg: src.addedKg };
  if (src.assistanceKg != null) return { ...line, assistanceKg: src.assistanceKg };
  return line;
}

export function resolveCoachSets(
  sets: {
    name: string;
    loadMode?: string;
    reps: number;
    weightKg?: number;
    setIndex?: number;
  }[],
  exercises: WorkoutExercise[],
  last: LastSetContext | null,
): ParsedSetLine[] {
  return sets
    .filter((s) => s.name && s.reps > 0)
    .map((s) => {
      const stripped = cleanName(s.name.replace(/\bsets?\s*\d+\b/gi, " "));
      const existing = exercises.find((ex) => namesMatch(ex.name, stripped));
      const name = isFillerName(stripped)
        ? (last?.name ?? stripped)
        : (existing?.name ??
          (last && namesMatch(last.name, stripped) ? last.name : stripped));
      const loadMode =
        s.loadMode === "bodyweight" || s.loadMode === "assisted"
          ? s.loadMode
          : inferLoadMode(name);
      const line: ParsedSetLine = {
        name,
        loadMode,
        reps: s.reps,
        weightKg: s.weightKg,
        setIndex: s.setIndex,
      };
      if (
        line.weightKg == null &&
        last &&
        namesMatch(name, last.name)
      ) {
        return copyLoad(line, last);
      }
      return line;
    });
}

export function lastSetContext(
  exercises: WorkoutExercise[],
): LastSetContext | null {
  for (let i = exercises.length - 1; i >= 0; i--) {
    const ex = exercises[i];
    const sets = (ex.sets ?? []).filter((s) => s.reps > 0);
    if (!sets.length) continue;
    const last = sets[sets.length - 1];
    return {
      name: ex.name,
      loadMode: ex.loadMode,
      weightKg: last.weightKg,
      addedKg: last.addedKg,
      assistanceKg: last.assistanceKg,
      lastSetIndex: sets.length,
    };
  }
  return null;
}

function parseFollowUp(
  text: string,
  last: LastSetContext,
  memory: ExerciseMemoryEntry[],
): ParsedSetLine | null {
  const raw = text.trim();
  if (!raw || raw.length > 120) return null;
  if (parseCardio(raw) && !/\d+\s*(kg|kilos?|lbs?)/i.test(raw)) return null;

  const setIndex =
    extractSetOrdinal(raw) ??
    (/\b(?:next|another)\s+set\b|\bone more(?:\s+set)?\b/i.test(raw)
      ? last.lastSetIndex + 1
      : undefined);
  const weightM = raw.match(
    /(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)/i,
  );
  const same = /\bsame(?:\s+(?:weight|load|kg|as\s+before))?\b/i.test(raw);
  const nextCue = /\b(?:next|another)\s+set\b|\bone more\b/i.test(raw);
  const leftover = leftoverExerciseName(raw);
  const hasRealName = Boolean(leftover && looksLikeExercise(leftover));
  const repsM =
    raw.match(/(\d+)\s*reps?\b/i) ||
    raw.match(/[x×]\s*(\d+)\s*$/i) ||
    (!hasRealName && !weightM ? raw.match(/(?:^|\s)(\d+)\s*$/) : null);
  const reps = repsM ? Number(repsM[1]) : 0;
  if (!(reps > 0) || reps > 80) return null;

  const isFollow =
    same ||
    nextCue ||
    (!hasRealName && setIndex != null) ||
    (!hasRealName && /\breps?\b/i.test(raw)) ||
    (hasRealName && !weightM && (same || setIndex != null || nextCue));
  if (!isFollow) return null;
  if (hasRealName && weightM && !same && !nextCue) return null;

  const name = hasRealName ? resolveName(leftover, memory) : last.name;
  const line: ParsedSetLine = {
    name,
    loadMode: hasRealName ? inferLoadMode(name) : last.loadMode,
    reps,
    setIndex,
  };
  if (weightM) {
    const load = toKg(Number(weightM[1]), weightM[2]);
    return line.loadMode === "weighted"
      ? { ...line, weightKg: load }
      : { ...line, addedKg: load };
  }
  const sameExercise = nameKey(name) === nameKey(last.name);
  if (same || !hasRealName || sameExercise) return copyLoad(line, last);
  return line;
}

function resolveName(
  name: string,
  memory: ExerciseMemoryEntry[] = [],
): string {
  const cleaned = cleanName(name)
    .replace(/\bdb\b/gi, "dumbbell")
    .replace(/\bbb\b/gi, "barbell")
    .replace(/\bohp\b/gi, "overhead press");
  if (!cleaned) return name.trim();
  const key = cleaned.toLowerCase();
  const exact = memory.find((m) => m.name.toLowerCase() === key);
  if (exact) return exact.name;
  const fuzzy = memory.find((m) => {
    const n = m.name.toLowerCase();
    return n.includes(key) || key.includes(n);
  });
  return fuzzy?.name ?? cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseOne(
  chunk: string,
  memory: ExerciseMemoryEntry[],
): ParsedSetLine[] {
  const text = chunk.trim().replace(/^[•\-–]+\s*/, "");
  if (!text || text.length > 120) return [];
  if (parseCardio(text) && !/\d+\s*(kg|kilos?|lbs?)/i.test(text)) return [];

  const stripped = stripSetMarker(text);
  const rest = stripped.text;
  const leadSet = stripped.setIndex;

  const multi = rest.match(
    /^(?:(\d+)\s*[x×]\s*(\d+)\s*(?:@|at)?\s*(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)?\s+(.+)|(.+?)\s+(\d+)\s*[x×]\s*(\d+)\s*(?:@|at)?\s*(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)?)$/i,
  );
  if (multi) {
    const count = Number(multi[1] || multi[7]);
    const reps = Number(multi[2] || multi[8]);
    const load = Number(multi[3] || multi[9]);
    const unit = multi[4] || multi[10];
    const name = resolveName(multi[5] || multi[6] || "", memory);
    if (looksLikeExercise(name) && reps > 0 && count > 0 && count <= 12) {
      return [
        {
          name,
          loadMode: inferLoadMode(name),
          reps,
          weightKg: toKg(load, unit),
          setIndex: leadSet,
          repeat: count,
        },
      ];
    }
  }

  const detailed = rest.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)?\s*(?:[x×]\s*)?(\d+)\s*(?:reps?)?(?:\s+set\s*(\d+))?$/i,
  );
  if (detailed) {
    const name = resolveName(detailed[1], memory);
    const load = Number(detailed[2]);
    const unit = detailed[3];
    const reps = Number(detailed[4]);
    const setIndex = Number(detailed[5]) || leadSet;
    if (looksLikeExercise(name) && reps > 0) {
      const loadMode = inferLoadMode(name);
      return [
        {
          name,
          loadMode,
          reps,
          ...(loadMode === "weighted"
            ? { weightKg: toKg(load, unit || "kg") }
            : { addedKg: toKg(load, unit || "kg") }),
          setIndex,
        },
      ];
    }
  }

  const compact = rest.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)$/i);
  if (compact) {
    const name = resolveName(compact[1], memory);
    const load = Number(compact[2]);
    const reps = Number(compact[3]);
    if (looksLikeExercise(name) && reps > 0) {
      const loadMode = inferLoadMode(name);
      return [
        {
          name,
          loadMode,
          reps,
          ...(loadMode === "weighted" ? { weightKg: load } : { addedKg: load }),
          setIndex: leadSet,
        },
      ];
    }
  }

  const bwTail = rest.match(/^(.+?)\s+(\d+)\s*(?:reps?)?$/i);
  if (bwTail) {
    const name = resolveName(bwTail[1], memory);
    const reps = Number(bwTail[2]);
    if (
      looksLikeExercise(name) &&
      reps > 0 &&
      reps <= 80 &&
      (inferLoadMode(name) !== "weighted" || /\breps?\b/i.test(rest))
    ) {
      return [
        {
          name,
          loadMode: inferLoadMode(name),
          reps,
          setIndex: leadSet,
        },
      ];
    }
  }

  const bwHead = rest.match(/^(\d+)\s*(?:reps?)?\s+(.+)$/i);
  if (bwHead) {
    const name = resolveName(bwHead[2], memory);
    const reps = Number(bwHead[1]);
    if (looksLikeExercise(name) && inferLoadMode(name) !== "weighted") {
      return [{ name, loadMode: inferLoadMode(name), reps, setIndex: leadSet }];
    }
  }

  return [];
}

function parseLoose(
  text: string,
  memory: ExerciseMemoryEntry[],
): ParsedSetLine[] {
  const found: ParsedSetLine[] = [];
  const re =
    /([a-z][a-z0-9 /&'+.-]{1,40}?)\s+(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)\s*(?:[x×]\s*)?(\d+)\s*(?:reps?)?(?:\s+set\s*(\d+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const marked = stripSetMarker(m[1]);
    const name = resolveName(marked.text, memory);
    const reps = Number(m[4]);
    if (!looksLikeExercise(name) || reps <= 0) continue;
    const loadMode = inferLoadMode(name);
    found.push({
      name,
      loadMode,
      reps,
      ...(loadMode === "weighted"
        ? { weightKg: toKg(Number(m[2]), m[3]) }
        : { addedKg: toKg(Number(m[2]), m[3]) }),
      setIndex: m[5] ? Number(m[5]) : marked.setIndex,
    });
  }
  if (found.length) return found;

  for (const hit of text.matchAll(
    /([a-z][a-z0-9 /&'+.-]{1,40}?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)/gi,
  )) {
    const name = resolveName(hit[1], memory);
    const reps = Number(hit[3]);
    if (!looksLikeExercise(name) || reps <= 0) continue;
    const loadMode = inferLoadMode(name);
    const load = Number(hit[2]);
    found.push({
      name,
      loadMode,
      reps,
      ...(loadMode === "weighted" ? { weightKg: load } : { addedKg: load }),
    });
  }
  return found;
}

function fillMissingLoad(
  lines: ParsedSetLine[],
  last: LastSetContext | null,
): ParsedSetLine[] {
  if (!last) return lines;
  return lines.map((line) => {
    if (line.weightKg != null || line.addedKg != null || line.assistanceKg != null) {
      return line;
    }
    if (nameKey(line.name) !== nameKey(last.name)) return line;
    return copyLoad(line, last);
  });
}

export function parseWorkoutLog(
  text: string,
  memory: ExerciseMemoryEntry[] = [],
  last?: LastSetContext | null,
): ParsedSetLine[] {
  const raw = text.trim();
  if (!raw) return [];
  if (SKIP_IF_NO_NUMBERS.test(raw) && !/\d/.test(raw)) return [];

  const stripped = raw
    .replace(/^hey(?:\s+ai)?[,.]?\s*/i, "")
    .replace(
      /^(?:done(?:\s+with(?:\s+(?:my|the))?\s+(?:workout|session))?|i(?:'m| am)?\s+(?:just\s+)?(?:did|finished|logged))[:\-–,.]?\s*/i,
      "",
    );

  if (last) {
    const follow = parseFollowUp(stripped, last, memory);
    if (follow) return [follow];
  }

  const chunks = stripped
    .split(/\n+|;\s*|(?:\s+then\s+)/i)
    .flatMap((part) => {
      if (/,/.test(part) && /\d/.test(part)) {
        return part.split(/,\s*/).filter(Boolean);
      }
      return [part];
    })
    .map((c) => c.trim())
    .filter(Boolean);

  const out: ParsedSetLine[] = [];
  for (const chunk of chunks) {
    out.push(...parseOne(chunk, memory));
  }
  if (out.length === 0) out.push(...parseLoose(stripped, memory));
  return fillMissingLoad(out, last ?? null);
}

export function isNameOnlyWorkoutList(text: string): boolean {
  const t = text.trim();
  if (!/done|i did|finished|logged/i.test(t)) return false;
  if (/\d+\s*(kg|kilos?|lbs?|[x×]|reps?)/i.test(t)) return false;
  return /[a-z]{3,}/i.test(t);
}

export function parsedToSet(line: ParsedSetLine): WorkoutSet {
  const set: WorkoutSet = { reps: line.reps };
  if (line.weightKg != null) set.weightKg = line.weightKg;
  if (line.addedKg != null) set.addedKg = line.addedKg;
  if (line.assistanceKg != null) set.assistanceKg = line.assistanceKg;
  return set;
}

function namesMatch(a: string, b: string): boolean {
  const na = nameKey(a);
  const nb = nameKey(b);
  return Boolean(na && nb && na === nb);
}

function cleanerName(a: string, b: string): string {
  const score = (n: string) => {
    let s = 0;
    if (!/\d/.test(n)) s += 3;
    const last = n.trim().split(/\s+/).pop() ?? "";
    if (!/s$/i.test(last) || /ss$/i.test(last)) s += 1;
    s -= n.length * 0.01;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

export function collapseDuplicateExercises(
  exercises: WorkoutExercise[],
): WorkoutExercise[] {
  const next: WorkoutExercise[] = [];
  for (const ex of exercises) {
    if (isFillerName(ex.name)) {
      if (next.length) {
        const dest = next[next.length - 1];
        const prev = [...dest.sets].reverse().find((s) => s.reps > 0);
        const filled = ex.sets.map((s) => {
          if (
            s.weightKg != null ||
            s.addedKg != null ||
            s.assistanceKg != null ||
            !prev
          ) {
            return s;
          }
          return {
            ...s,
            weightKg: prev.weightKg,
            addedKg: prev.addedKg,
            assistanceKg: prev.assistanceKg,
          };
        });
        next[next.length - 1] = {
          ...dest,
          sets: [...dest.sets, ...filled],
        };
      }
      continue;
    }
    const idx = next.findIndex((e) => namesMatch(e.name, ex.name));
    if (idx < 0) {
      next.push({
        ...ex,
        name: cleanName(ex.name) || ex.name,
        sets: [...ex.sets],
      });
      continue;
    }
    next[idx] = {
      ...next[idx],
      name: cleanerName(cleanName(next[idx].name) || next[idx].name, cleanName(ex.name) || ex.name),
      sets: [...next[idx].sets, ...ex.sets],
    };
  }
  return next;
}

export function mergeSetsIntoExercises(
  exercises: WorkoutExercise[],
  lines: ParsedSetLine[],
): WorkoutExercise[] {
  const next = collapseDuplicateExercises(exercises).map((ex) => ({
    ...ex,
    sets: [...ex.sets],
  }));

  for (const line of lines) {
    const copies = Math.max(1, line.repeat ?? 1);
    let idx = next.findIndex((ex) => namesMatch(ex.name, line.name));
    if (idx < 0) {
      next.push({
        name: line.name,
        loadMode: line.loadMode,
        sets: [],
      });
      idx = next.length - 1;
    } else {
      next[idx] = {
        ...next[idx],
        name: cleanerName(next[idx].name, line.name),
      };
    }
    const ex = next[idx];
    for (let i = 0; i < copies; i++) {
      const set = parsedToSet(line);
      if (line.setIndex != null && copies === 1) {
        const pos = Math.max(0, line.setIndex - 1);
        while (ex.sets.length < pos) ex.sets.push({ reps: 0 });
        if (pos < ex.sets.length) ex.sets[pos] = set;
        else ex.sets.push(set);
      } else {
        ex.sets.push(set);
      }
    }
    while (ex.sets.length > 0 && ex.sets[ex.sets.length - 1].reps <= 0) {
      ex.sets.pop();
    }
  }
  return next;
}

export function summarizeSessionExercises(exercises: WorkoutExercise[]): string {
  if (exercises.length === 0) return "Nothing logged yet.";
  return exercises
    .map((ex) => {
      const sets = ex.sets
        .filter((s) => s.reps > 0)
        .map((s, i) => {
          const load =
            s.weightKg != null
              ? `${s.weightKg}kg`
              : s.addedKg != null
                ? `+${s.addedKg}kg`
                : "";
          return `set ${i + 1}: ${load} × ${s.reps}`.replace(/\s+/g, " ");
        })
        .join(", ");
      return `${ex.name} — ${sets || "no sets"}`;
    })
    .join("\n");
}

export function formatParsedSet(line: ParsedSetLine): string {
  const load =
    line.weightKg != null
      ? `${line.weightKg}kg`
      : line.addedKg != null
        ? `+${line.addedKg}kg`
        : line.loadMode === "bodyweight"
          ? "BW"
          : "";
  const set = line.setIndex ? ` set ${line.setIndex}` : "";
  const extra = line.repeat && line.repeat > 1 ? ` ×${line.repeat}` : "";
  return `${line.name} ${load} ${line.reps} reps${set}${extra}`.replace(
    /\s+/g,
    " ",
  );
}

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
].filter((m): m is string => Boolean(m));

const JSON_SHAPE = `Return ONLY valid JSON with no markdown fences in exactly this shape:
{
  "reply": "string — conversational coach message for the user",
  "intent": "plan" | "skip" | "done" | "log_set" | "insight" | "estimate" | "chat",
  "markSkipped": false,
  "skippedSplit": "push" | "pull" | "legs" | "upper" | "lower" | "full" | "cardio" | "other" | null,
  "suggestedSplit": "push" | "pull" | "legs" | "upper" | "lower" | "full" | "cardio" | "other" | null,
  "draftExercises": [{"name":"string","loadMode":"weighted"|"bodyweight"|"assisted","suggestedSets":3}],
  "loggedSets": [{"name":"string","loadMode":"weighted"|"bodyweight"|"assisted","reps":0,"weightKg":0,"setIndex":1}],
  "loggedCardio": {"type":"incline walk","minutes":30,"inclinePct":12.5,"speedKmh":3.5,"intensity":"moderate"} | null,
  "estimatedKcal": 0,
  "openLogPrompt": false
}
Rules:
- Interpret informal logging in context of SESSION_DRAFT and LAST_LIFT. You decide the exercise, set index, and load.
- "2nd set same weight 10 rep", "next set 10", "same 8", "another set" → continue LAST_LIFT. Reuse its exact name and weightKg unless they give a new load. Never name an exercise "2nd", "Same Weight", or include the set number in the name.
- Only start a new exercise when they clearly name one (e.g. leg press, RDL). Prefer the exact name already in SESSION_DRAFT / memory (deadlift = Deadlift).
- setIndex is the set number (1-based). Do not invent sets they did not describe.
- If they omit weight but say same / next / 2nd set, copy LAST_LIFT.weightKg.
- suggestedSplit must match the day THEY named (leg/legs → legs). Do not default to the weekly template.
- Cardio lines (incline walk, treadmill, minutes, % grade, km/h) → fill loggedCardio. Keep existing cardio fields if they only add details.
- draftExercises + openLogPrompt=true ONLY when they listed exercise NAMES with no weights/reps and you cannot log sets.
- Prefer the user's exercise memory / history; never invent past numbers they didn't log.
- For bodyweight moves use loadMode "bodyweight" or "assisted".
- Keep reply concise. Confirm what was logged when intent is log_set.
- estimatedKcal: 0 unless estimating.`;

const SYSTEM = `You are MacroAI's personal gym coach inside a calorie + training tracker.
You know THIS user's plan, recent workouts, and exercise memory (last loads/reps).
Personalize every answer to their history. Prefer movements they already do; suggest new ones only when helpful.
Help with: what to train today, recovering after skips, logging finished workouts, cardio, progress insights, and calorie-burn estimates.

When they say they are about to train a split (e.g. "doing push today"), intent=plan: outline exercises with sets/reps/load hints from memory.
When they list exercises they finished with NAMES only, intent=done, openLogPrompt=true, fill draftExercises.
When they log a set — including messy phrasing — intent=log_set and fill loggedSets from LAST_LIFT + SESSION_DRAFT.
When they skipped a day and ask how to get back on track, intent=skip or plan: markSkipped if they confirm a skip, and recommend today so weekly muscle coverage stays sane.
When they ask how they are progressing, intent=insight.
When they only want burn estimate, intent=estimate.

${JSON_SHAPE}`;

type DraftEx = {
  name: string;
  loadMode: "weighted" | "bodyweight" | "assisted";
  suggestedSets?: number;
};

function parseJsonLoose(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as Record<string, unknown>;
}

export async function POST(req: Request) {
  let body: {
    apiKey?: string;
    model?: string;
    action?: string;
    messages?: { role?: string; content?: string }[];
    context?: {
      today?: string;
      bodyweightKg?: number;
      plan?: unknown;
      history?: unknown;
      exerciseMemory?: unknown;
      stepsToday?: number;
      sessionDraft?: unknown;
      lastSet?: unknown;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add your own free Gemini API key in Settings to use the gym coach." },
      { status: 400 },
    );
  }

  const preferredModel = (body.model ?? "").trim();
  const models = preferredModel
    ? [preferredModel, ...MODELS.filter((m) => m !== preferredModel)]
    : MODELS;

  const action = (body.action ?? "chat").trim() || "chat";
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 4000),
    }));

  if (messages.length === 0 && action === "chat") {
    return NextResponse.json(
      { error: "Say something to the coach first." },
      { status: 400 },
    );
  }

  const actionHint =
    action === "plan_today"
      ? "ACTION HINT: User wants today's workout plan. Prefer intent=plan."
      : action === "parse_done" || action === "log_set"
        ? "ACTION HINT: User is logging mid-workout. Interpret their last message, intent=log_set, fill loggedSets and/or loggedCardio. Use LAST_LIFT when they do not name a new exercise. openLogPrompt=false if you can log it."
        : action === "insight"
          ? "ACTION HINT: Progress insight. Prefer intent=insight."
          : action === "estimate"
            ? "ACTION HINT: Estimate calories burned for the draft/session in context. Prefer intent=estimate."
            : "ACTION HINT: General coach chat — detect intent from the last user message.";

  const transcript =
    messages.length > 0
      ? messages
          .map(
            (m) =>
              `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`,
          )
          .join("\n")
      : "User: (see action hint)";

  const contextText = `${SYSTEM}

${actionHint}

TODAY: ${body.context?.today ?? "unknown"}
BODYWEIGHT_KG: ${body.context?.bodyweightKg ?? 75}
STEPS_TODAY: ${body.context?.stepsToday ?? 0}

GYM_PLAN:
${JSON.stringify(body.context?.plan ?? {}, null, 2)}

EXERCISE_MEMORY (last known loads/reps):
${JSON.stringify(body.context?.exerciseMemory ?? [], null, 2)}

RECENT_HISTORY (newest first, compact):
${JSON.stringify(body.context?.history ?? [], null, 2)}

SESSION_DRAFT (today's workout so far):
${JSON.stringify(body.context?.sessionDraft ?? null, null, 2)}

LAST_LIFT (continue this lift unless they name a different one):
${JSON.stringify(body.context?.lastSet ?? null, null, 2)}

CONVERSATION:
${transcript}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = "";
  let quotaBlocked = false;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature:
            action === "log_set" || action === "parse_done" ? 0.2 : 0.45,
        },
      });
      const result = await model.generateContent([{ text: contextText }]);
      const parsed = parseJsonLoose(result.response.text());

      const draftRaw = Array.isArray(parsed.draftExercises)
        ? (parsed.draftExercises as Record<string, unknown>[])
        : [];
      const draftExercises: DraftEx[] = [];
      for (const ex of draftRaw) {
        const name = String(ex?.name ?? "").trim();
        if (!name) continue;
        const lm = String(ex?.loadMode ?? "").toLowerCase();
        const loadMode: DraftEx["loadMode"] =
          lm === "bodyweight" || lm === "assisted" || lm === "weighted"
            ? lm
            : "weighted";
        const suggestedSets = Math.max(
          1,
          Math.min(8, Math.round(Number(ex?.suggestedSets) || 3)),
        );
        draftExercises.push({ name, loadMode, suggestedSets });
      }

      const loggedSets: {
        name: string;
        loadMode: "weighted" | "bodyweight" | "assisted";
        reps: number;
        weightKg?: number;
        setIndex?: number;
      }[] = [];
      const loggedRaw = Array.isArray(parsed.loggedSets)
        ? (parsed.loggedSets as Record<string, unknown>[])
        : [];
      for (const s of loggedRaw) {
        const name = String(s?.name ?? "").trim();
        const reps = Math.round(Number(s?.reps) || 0);
        if (!name || reps <= 0) continue;
        const lm = String(s?.loadMode ?? "").toLowerCase();
        loggedSets.push({
          name,
          loadMode:
            lm === "bodyweight" || lm === "assisted" || lm === "weighted"
              ? lm
              : "weighted",
          reps,
          weightKg: Number(s?.weightKg) > 0 ? Number(s.weightKg) : undefined,
          setIndex:
            Number(s?.setIndex) > 0
              ? Math.round(Number(s.setIndex))
              : undefined,
        });
      }

      const intent = String(parsed.intent ?? "chat");
      const openLogPrompt =
        loggedSets.length === 0 &&
        (Boolean(parsed.openLogPrompt) ||
          (intent === "done" && draftExercises.length > 0));

      const cardioRaw =
        parsed.loggedCardio && typeof parsed.loggedCardio === "object"
          ? (parsed.loggedCardio as Record<string, unknown>)
          : null;
      const cardioMinutes = Math.round(Number(cardioRaw?.minutes) || 0);
      const loggedCardio =
        cardioRaw && cardioMinutes > 0
          ? {
              type: String(cardioRaw.type ?? "cardio").trim() || "cardio",
              minutes: cardioMinutes,
              inclinePct:
                Number(cardioRaw.inclinePct) > 0
                  ? Number(cardioRaw.inclinePct)
                  : undefined,
              speedKmh:
                Number(cardioRaw.speedKmh) > 0
                  ? Number(cardioRaw.speedKmh)
                  : undefined,
              intensity:
                cardioRaw.intensity === "easy" ||
                cardioRaw.intensity === "moderate" ||
                cardioRaw.intensity === "hard"
                  ? cardioRaw.intensity
                  : undefined,
            }
          : null;

      return NextResponse.json({
        reply: String(parsed.reply ?? "").trim() || "Okay.",
        intent,
        markSkipped: Boolean(parsed.markSkipped),
        skippedSplit: parsed.skippedSplit
          ? String(parsed.skippedSplit)
          : null,
        suggestedSplit: parsed.suggestedSplit
          ? String(parsed.suggestedSplit)
          : null,
        draftExercises,
        loggedSets,
        loggedCardio,
        estimatedKcal: Math.max(
          0,
          Math.round(Number(parsed.estimatedKcal) || 0),
        ),
        openLogPrompt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      lastError = message;
      if (
        /API key not valid|API_KEY_INVALID|\b400\b.*key|permission|\b403\b/i.test(
          message,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Your Gemini API key was rejected. Check it in Settings (it should start with “AIza”).",
          },
          { status: 401 },
        );
      }
      const isOverloaded503 =
        /\b503\b|overload|high.?demand|service.?unavailable/i.test(message);
      const isSchemaError = /string did not match|expected pattern/i.test(
        message,
      );
      if (
        /\b429\b|quota|rate.?limit/i.test(message) ||
        isOverloaded503 ||
        isSchemaError
      ) {
        quotaBlocked =
          /\b429\b|quota|rate.?limit/i.test(message) || quotaBlocked;
        continue;
      }
      break;
    }
  }

  if (quotaBlocked) {
    return NextResponse.json(
      {
        error:
          "Your Gemini key's quota is used up for now. Wait a minute, or until ~2pm Bangkok time for the daily reset.",
      },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: `Gym coach failed: ${lastError}` },
    { status: 502 },
  );
}

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
  "intent": "plan" | "skip" | "done" | "insight" | "estimate" | "chat",
  "markSkipped": false,
  "skippedSplit": "push" | "pull" | "legs" | "upper" | "lower" | "full" | "cardio" | "other" | null,
  "suggestedSplit": "push" | "pull" | "legs" | "upper" | "lower" | "full" | "cardio" | "other" | null,
  "draftExercises": [{"name":"string","loadMode":"weighted"|"bodyweight"|"assisted","suggestedSets":3}],
  "estimatedKcal": 0,
  "openLogPrompt": false
}
Rules:
- draftExercises: only when intent is "done" (user finished a workout and listed exercises) OR when intent is "plan" and you want a concrete outline (still set openLogPrompt false for plan).
- openLogPrompt: true ONLY when the user reported a completed workout and you parsed exercises they did (intent "done").
- markSkipped: true when the user clearly skipped a planned day; set skippedSplit to which day they skipped if known.
- Prefer the user's exercise memory / history for suggestions; never invent past numbers they didn't log.
- For bodyweight moves (dips, pull-ups, push-ups, etc.) use loadMode "bodyweight" or "assisted".
- Keep reply concise and actionable (short paragraphs or bullets).
- estimatedKcal: rough burn for the session when estimating or after a done parse; else 0.`;

const SYSTEM = `You are MacroAI's personal gym coach inside a calorie + training tracker.
You know THIS user's plan, recent workouts, and exercise memory (last loads/reps).
Personalize every answer to their history. Prefer movements they already do; suggest new ones only when helpful.
Help with: what to train today, recovering after skips, logging finished workouts, cardio, progress insights, and calorie-burn estimates.

When they say they are about to train a split (e.g. "doing push today"), intent=plan: outline exercises with sets/reps/load hints from memory.
When they list exercises they finished (e.g. "done — incline DB, pec deck, dips…"), intent=done, openLogPrompt=true, fill draftExercises (names + loadMode). The app will ask them for weights/reps next.
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
      : action === "parse_done"
        ? "ACTION HINT: User finished training and listed exercises. Prefer intent=done, openLogPrompt=true, fill draftExercises."
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

SESSION_DRAFT (if any):
${JSON.stringify(body.context?.sessionDraft ?? null, null, 2)}

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
          temperature: 0.45,
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

      const intent = String(parsed.intent ?? "chat");
      const openLogPrompt =
        Boolean(parsed.openLogPrompt) ||
        (intent === "done" && draftExercises.length > 0);

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

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

// JSON shape embedded in the prompt (not via responseSchema — the constrained
// decoder is fragile and omits optional fields like "items" on longer contexts,
// causing silent update failures after the first exchange).
const JSON_SHAPE = `Return ONLY valid JSON with no markdown fences in exactly this shape:
{"reply":"string","updated":false,"items":[{"name":"string","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}]}
IMPORTANT: when updated is true you MUST always include the full items array — never omit it.
When updated is false, still include "items" as an empty array [].`;

const SYSTEM = `You are a friendly, sharp nutrition coach inside a calorie-tracking app.
The user is reviewing a logged meal/item and wants to DISCUSS the estimate with you —
they may agree, disagree, ask why, or tell you to change something
(e.g. "that rice looks like too much", "I only ate half", "add the olive oil",
"this was a large portion not medium").

How to respond:
- Always reply conversationally in "reply": acknowledge their point, explain your
  reasoning briefly (what you see / how you estimate), and say what you changed (if anything).
- If their feedback means the numbers should change, set "updated" to true and return
  the FULL revised "items" list (every item, not just the changed one), keeping items
  they didn't mention the same. If nothing should change, set "updated" to false and
  return an empty items array.
- When given photos (the meal or leftovers), use them to ground your reasoning.
- Keep calories internally consistent: calories ≈ protein*4 + carbs*4 + fat*9.
- Be honest: if you think their adjustment is unrealistic, say so and propose a sensible
  number rather than blindly obeying. But the user has the final say.
- If asked to EXPLAIN your logic / why the numbers are what they are, walk through how
  each item was identified, how the portion was judged (reference objects, typical serving),
  and how the calories/macros were derived. Use the "original reasoning" below if provided.
- Keep replies short (1-3 sentences) UNLESS the user asks you to explain your logic, in
  which case a clear short paragraph or a few bullet points is fine.
- Round grams & calories to integers, macros to one decimal.

${JSON_SHAPE}`;

type Item = {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function reconcile(raw: Partial<Item>): Item {
  const protein = Math.max(0, Math.round((Number(raw.protein) || 0) * 10) / 10);
  const carbs = Math.max(0, Math.round((Number(raw.carbs) || 0) * 10) / 10);
  const fat = Math.max(0, Math.round((Number(raw.fat) || 0) * 10) / 10);
  const macroKcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
  let calories = Math.max(0, Math.round(Number(raw.calories) || 0));
  if (
    macroKcal > 0 &&
    (calories === 0 || Math.abs(calories - macroKcal) / macroKcal > 0.25)
  ) {
    calories = macroKcal;
  }
  return {
    name: String(raw.name ?? "Food"),
    grams: Math.max(0, Math.round(Number(raw.grams) || 0)),
    calories,
    protein,
    carbs,
    fat,
  };
}

export async function POST(req: Request) {
  let body: {
    apiKey?: string;
    model?: string;
    kind?: "scan" | "item";
    items?: Partial<Item>[];
    images?: { base64?: string; mimeType?: string }[];
    messages?: { role?: string; content?: string }[];
    reasoning?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add your own free Gemini API key in Settings to use AI chat." },
      { status: 400 },
    );
  }

  const preferredModel = (body.model ?? "").trim();
  const models = preferredModel
    ? [preferredModel, ...MODELS.filter((m) => m !== preferredModel)]
    : MODELS;

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000),
    }));
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "Say something to the assistant first." },
      { status: 400 },
    );
  }

  const items = (Array.isArray(body.items) ? body.items : []).map((it) => ({
    name: String(it?.name ?? "Food"),
    grams: Number(it?.grams) || 0,
    calories: Number(it?.calories) || 0,
    protein: Number(it?.protein) || 0,
    carbs: Number(it?.carbs) || 0,
    fat: Number(it?.fat) || 0,
  }));

  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(
      (im): im is { base64: string; mimeType: string } =>
        Boolean(im?.base64 && im?.mimeType),
    )
    .slice(0, 6);

  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n");

  const reasoning = String(body.reasoning ?? "").trim().slice(0, 4000);
  const reasoningBlock = reasoning
    ? `\n\nYOUR ORIGINAL REASONING when first estimating this ${
        body.kind === "item" ? "item" : "meal"
      } (use this if the user asks you to explain your logic):
${reasoning}`
    : "";

  const contextText = `${SYSTEM}

CURRENT ESTIMATE (the items currently logged for this ${
    body.kind === "item" ? "item" : "meal"
  }):
${JSON.stringify(items, null, 2)}${reasoningBlock}

CONVERSATION SO FAR (reply to the last User message):
${transcript}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [
    { text: contextText },
    ...images.map((im) => ({
      inlineData: { data: im.base64, mimeType: im.mimeType },
    })),
  ];

  let lastError = "";
  let quotaBlocked = false;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      });
      const result = await model.generateContent(parts);
      const parsed = JSON.parse(result.response.text()) as {
        reply?: string;
        updated?: boolean;
        items?: Partial<Item>[];
      };
      const updated = Boolean(parsed.updated) && Array.isArray(parsed.items);
      return NextResponse.json({
        reply: String(parsed.reply ?? "").trim() || "Okay.",
        updated,
        items: updated ? (parsed.items as Partial<Item>[]).map(reconcile) : undefined,
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
      const isOverloaded503 = /\b503\b|overload|high.?demand|service.?unavailable/i.test(message);
      const isSchemaError = /string did not match|expected pattern/i.test(message);
      if (/\b429\b|quota|rate.?limit/i.test(message) || isOverloaded503 || isSchemaError) {
        quotaBlocked = /\b429\b|quota|rate.?limit/i.test(message) || quotaBlocked;
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
    { error: `Chat failed: ${lastError}` },
    { status: 502 },
  );
}

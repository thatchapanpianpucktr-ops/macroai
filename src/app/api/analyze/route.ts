import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AnalyzeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Tried in order; we fall back to the next when one is quota-blocked (429).
// An optional GEMINI_MODEL env var is tried first.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
].filter((m): m is string => Boolean(m));

const PROMPT = `You are a meticulous nutrition estimation assistant for a calorie-tracking app.
Identify each distinct food or drink item in the photo(s). For composite dishes
(stir-fries, salads, sandwiches, curries), break them into their main components
when that improves accuracy.

MULTIPLE PHOTOS: You may receive several photos of the SAME meal or product
(e.g. the front of a package and its nutrition label, or the same plate from
different angles). Treat all photos together as ONE submission describing the
same food. Use the clearest views, and if a nutrition-facts label or ingredient
list is visible, prefer those exact numbers. NEVER count the same item more than
once just because it appears in multiple photos.

PORTION SIZE — reason from visual reference cues, don't just guess:
- A dinner plate is ~26 cm across; a fork ~19 cm; a teaspoon ~5 ml, a tablespoon ~15 ml.
- A standard soda can is 330 ml; a mug ~250 ml; a slice of bread ~30 g.
- Compare the food's footprint and height to these references to estimate grams/volume.

NUTRITION:
- First estimate realistic per-100g values for the food, then scale to your portion.
- Account for HIDDEN calories in cooked/restaurant food: cooking oil, butter, dressings,
  sauces, and added sugar. Do not assume plain/dry unless it clearly is.
- Enforce internal consistency: calories must be ≈ protein*4 + carbs*4 + fat*9 (within ~10%).
  Reconcile the numbers until they agree.

For EACH item also return:
- "confidence": one of "high", "medium", "low" — driven mainly by how clear the portion is
  and how identifiable the food is.
- "calorieMin" and "calorieMax": a realistic calorie range reflecting portion uncertainty.

Rules:
- Be realistic, not optimistic. When unsure about portion, choose the most likely typical serving.
- If the image clearly contains no food, return an empty items array and a short note.
- Round grams and calories to integers; macros to at most one decimal.`;

const TEXT_PROMPT = `You are a meticulous nutrition estimation assistant for a calorie-tracking app.
The user describes in words what they ate (e.g. "50g banana, 2 boiled eggs, a cup of rice").
Identify each distinct food or drink item from the description.

PORTION SIZE:
- Use any quantities or weights the user gives (grams, pieces, cups, tbsp, slices).
- Convert household measures to grams (1 cup cooked rice ~158 g, 1 large egg ~50 g,
  1 tbsp oil ~14 g, 1 slice bread ~30 g).
- If a quantity is missing, assume the most likely typical serving and lower the confidence.

NUTRITION:
- Estimate realistic per-100g values then scale to the portion.
- Account for typical added oil/butter/sugar in prepared foods unless told otherwise.
- Enforce internal consistency: calories must be ≈ protein*4 + carbs*4 + fat*9 (within ~10%).
  Reconcile the numbers until they agree.

For EACH item also return:
- "confidence": one of "high", "medium", "low" — lower it when the user didn't specify a quantity.
- "calorieMin" and "calorieMax": a realistic calorie range reflecting the uncertainty.

Rules:
- Be realistic, not optimistic.
- If the text describes no food, return an empty items array and a short note.
- Round grams and calories to integers; macros to at most one decimal.`;

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          grams: { type: SchemaType.NUMBER },
          calories: { type: SchemaType.NUMBER },
          protein: { type: SchemaType.NUMBER },
          carbs: { type: SchemaType.NUMBER },
          fat: { type: SchemaType.NUMBER },
          confidence: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["high", "medium", "low"],
          },
          calorieMin: { type: SchemaType.NUMBER },
          calorieMax: { type: SchemaType.NUMBER },
        },
        required: [
          "name",
          "grams",
          "calories",
          "protein",
          "carbs",
          "fat",
          "confidence",
          "calorieMin",
          "calorieMax",
        ],
      },
    },
    note: { type: SchemaType.STRING },
  },
  required: ["items"],
} as const;

export async function POST(req: Request) {
  let body: {
    imageBase64?: string;
    mimeType?: string;
    images?: { base64?: string; mimeType?: string }[];
    hint?: string;
    description?: string;
    apiKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Prefer the user's own key (bring-your-own-key); fall back to the server key.
  const userKey = (body.apiKey ?? "").trim();
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No Gemini API key available. Add your own free key in Settings to use AI scanning.",
      },
      { status: 400 },
    );
  }

  const { imageBase64, mimeType, hint, description } = body;
  const desc = (description ?? "").trim();

  // Accept either a list of images or the legacy single-image fields.
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(
      (im): im is { base64: string; mimeType: string } =>
        Boolean(im?.base64 && im?.mimeType),
    )
    .slice(0, 6);
  if (images.length === 0 && imageBase64 && mimeType) {
    images.push({ base64: imageBase64, mimeType });
  }
  const hasImage = images.length > 0;

  if (!hasImage && !desc) {
    return NextResponse.json(
      { error: "Provide a photo or a text description of the food." },
      { status: 400 },
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const multiNote =
    images.length > 1
      ? `\n\nThese ${images.length} photos all show the SAME food/meal — combine them into one set of items, do not double count.`
      : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = hasImage
    ? [
        {
          text:
            PROMPT +
            multiNote +
            (hint ? `\n\nUser hint about the food: ${hint}` : ""),
        },
        ...images.map((im) => ({
          inlineData: { data: im.base64, mimeType: im.mimeType },
        })),
      ]
    : [{ text: `${TEXT_PROMPT}\n\nThe user ate:\n${desc}` }];

  let lastError = "";
  let quotaBlocked = false;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseSchema: responseSchema as any,
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(parts);
      const text = result.response.text();
      const parsed = JSON.parse(text) as AnalyzeResponse;

      parsed.items = (parsed.items || []).map((it) => {
        const protein = Math.max(0, Math.round((Number(it.protein) || 0) * 10) / 10);
        const carbs = Math.max(0, Math.round((Number(it.carbs) || 0) * 10) / 10);
        const fat = Math.max(0, Math.round((Number(it.fat) || 0) * 10) / 10);
        const macroKcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
        let calories = Math.max(0, Math.round(Number(it.calories) || 0));
        // Reconcile: if calories are missing or wildly off from the macros,
        // trust the macro-derived figure.
        if (
          macroKcal > 0 &&
          (calories === 0 || Math.abs(calories - macroKcal) / macroKcal > 0.25)
        ) {
          calories = macroKcal;
        }

        const conf = String(it.confidence ?? "").toLowerCase();
        const confidence =
          conf === "high" || conf === "medium" || conf === "low"
            ? (conf as "high" | "medium" | "low")
            : undefined;

        const num = (v: unknown) =>
          Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : undefined;

        return {
          name: String(it.name ?? "Food"),
          grams: Math.max(0, Math.round(Number(it.grams) || 0)),
          calories,
          protein,
          carbs,
          fat,
          confidence,
          calorieMin: num(it.calorieMin),
          calorieMax: num(it.calorieMax),
        };
      });

      return NextResponse.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      lastError = message;
      // Invalid / rejected API key — no point trying other models.
      if (
        /API key not valid|API_KEY_INVALID|\b400\b.*key|permission|\b403\b/i.test(
          message,
        )
      ) {
        return NextResponse.json(
          {
            error: userKey
              ? "Your Gemini API key was rejected. Double-check it in Settings (it should start with “AIza”)."
              : "The server's Gemini key was rejected. Add your own free key in Settings.",
          },
          { status: 401 },
        );
      }
      const isQuota = /\b429\b|quota|rate.?limit/i.test(message);
      if (isQuota) {
        quotaBlocked = true;
        // try the next model
        continue;
      }
      // Non-quota error (bad image, etc.) — stop early.
      break;
    }
  }

  if (quotaBlocked) {
    return NextResponse.json(
      {
        error: userKey
          ? "Your Gemini key's quota is used up for now. Wait a minute (per-minute limit) or until tomorrow (daily limit), or enable billing for higher limits."
          : "The shared Gemini quota is exhausted right now. Add your own free key in Settings to get your own quota, or try again later.",
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { error: `Failed to analyze image: ${lastError}` },
    { status: 502 },
  );
}

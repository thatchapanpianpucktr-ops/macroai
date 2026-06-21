import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
].filter((m): m is string => Boolean(m));

const PROMPT = `You estimate how much of a meal a person actually ATE.
You are given the ORIGINAL full serving they started with, plus either a photo of
the LEFTOVERS (the food that REMAINS uneaten) and/or a short note.

Estimate the fraction of the original serving that was EATEN, as a number from 0 to 1:
- Leftover photo shows about half the food remaining → they ate ~0.5.
- They left roughly a quarter → ate ~0.75.
- Empty / wiped-clean plate → ate ~1.0.
- Use the note if given: "ate half" = 0.5, "only a few bites" ≈ 0.15-0.25,
  "ate most of it" ≈ 0.85, "barely touched it" ≈ 0.1.
- If a photo and note disagree, prefer the photo but stay reasonable.

Return JSON: { "fractionEaten": number between 0 and 1, "note": a short human explanation }.`;

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    fractionEaten: { type: SchemaType.NUMBER },
    note: { type: SchemaType.STRING },
  },
  required: ["fractionEaten"],
} as const;

export async function POST(req: Request) {
  let body: {
    apiKey?: string;
    original?: { name?: string; grams?: number; calories?: number };
    images?: { base64?: string; mimeType?: string }[];
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add your own free Gemini API key in Settings to use AI." },
      { status: 400 },
    );
  }

  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(
      (im): im is { base64: string; mimeType: string } =>
        Boolean(im?.base64 && im?.mimeType),
    )
    .slice(0, 4);
  const note = (body.note ?? "").trim();

  if (images.length === 0 && !note) {
    return NextResponse.json(
      { error: "Provide a leftovers photo or a note about how much you ate." },
      { status: 400 },
    );
  }

  const orig = body.original ?? {};
  const context = `Original full serving: ${orig.name ?? "the meal"}${
    orig.grams ? `, ${orig.grams} g` : ""
  }${orig.calories ? `, ${orig.calories} kcal` : ""}.${
    note ? `\nUser note: ${note}` : ""
  }`;

  const genAI = new GoogleGenerativeAI(apiKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [
    { text: `${PROMPT}\n\n${context}` },
    ...images.map((im) => ({
      inlineData: { data: im.base64, mimeType: im.mimeType },
    })),
  ];

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
      const parsed = JSON.parse(result.response.text()) as {
        fractionEaten?: number;
        note?: string;
      };
      let f = Number(parsed.fractionEaten);
      if (!Number.isFinite(f)) f = 1;
      f = Math.min(1, Math.max(0, f));
      return NextResponse.json({ fractionEaten: f, note: parsed.note ?? "" });
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
      if (/\b429\b|quota|rate.?limit/i.test(message)) {
        quotaBlocked = true;
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
    { error: `Couldn't estimate the portion: ${lastError}` },
    { status: 502 },
  );
}

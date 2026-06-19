import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AnalyzeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const PROMPT = `You are a nutrition estimation assistant for a calorie-tracking app.
Look at the food photo and identify each distinct food/drink item.
For each item, estimate a realistic portion size in grams based on visual cues
(plate size, utensils, packaging) and return its nutrition for THAT portion.

Rules:
- Calories must be roughly consistent with macros: calories ≈ protein*4 + carbs*4 + fat*9.
- Be realistic, not optimistic. If unsure about portion, estimate the most likely typical serving.
- If the image clearly contains no food, return an empty items array and a short note.
- Round grams and calories to integers; macros to one decimal at most.`;

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
        },
        required: ["name", "grams", "calories", "protein", "carbs", "fat"],
      },
    },
    note: { type: SchemaType.STRING },
  },
  required: ["items"],
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. See README to set it up." },
      { status: 500 },
    );
  }

  let body: { imageBase64?: string; mimeType?: string; hint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageBase64, mimeType, hint } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required" },
      { status: 400 },
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: responseSchema as any,
        temperature: 0.2,
      },
    });

    const parts = [
      { text: PROMPT + (hint ? `\n\nUser hint about the food: ${hint}` : "") },
      { inlineData: { data: imageBase64, mimeType } },
    ];

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const parsed = JSON.parse(text) as AnalyzeResponse;

    // sanity defaults
    parsed.items = (parsed.items || []).map((it) => ({
      name: String(it.name ?? "Food"),
      grams: Math.max(0, Math.round(Number(it.grams) || 0)),
      calories: Math.max(0, Math.round(Number(it.calories) || 0)),
      protein: Math.max(0, Math.round((Number(it.protein) || 0) * 10) / 10),
      carbs: Math.max(0, Math.round((Number(it.carbs) || 0) * 10) / 10),
      fat: Math.max(0, Math.round((Number(it.fat) || 0) * 10) / 10),
    }));

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to analyze image: ${message}` },
      { status: 502 },
    );
  }
}

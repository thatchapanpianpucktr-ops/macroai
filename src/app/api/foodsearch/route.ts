import { NextResponse } from "next/server";
import type { FoodHit } from "@/lib/foodsearch-types";

export const runtime = "nodejs";
export const maxDuration = 20;

const UA = "MacroAI/1.0 (personal calorie tracker)";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function kcalPer100(nutr: Record<string, unknown>): number {
  const kcal = num(nutr["energy-kcal_100g"]);
  if (kcal > 0) return kcal;
  // fall back to kJ
  const kj = num(nutr["energy_100g"]) || num(nutr["energy-kj_100g"]);
  return kj > 0 ? kj / 4.184 : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHit(p: any): FoodHit | null {
  const name = (p?.product_name || p?.generic_name || "").trim();
  const nutr = p?.nutriments || {};
  if (!name) return null;
  const calories = Math.round(kcalPer100(nutr));
  const protein = Math.round(num(nutr["proteins_100g"]) * 10) / 10;
  const carbs = Math.round(num(nutr["carbohydrates_100g"]) * 10) / 10;
  const fat = Math.round(num(nutr["fat_100g"]) * 10) / 10;
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  const servingG = num(p?.serving_quantity) || undefined;
  return {
    name,
    brand: (p?.brands || "").split(",")[0].trim() || undefined,
    per100: { calories, protein, carbs, fat },
    servingG: servingG && servingG > 0 ? Math.round(servingG) : undefined,
    barcode: p?.code || undefined,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const barcode = (searchParams.get("barcode") || "").trim();

  try {
    if (barcode) {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
          barcode,
        )}.json?fields=product_name,generic_name,brands,nutriments,serving_quantity,code`,
        { headers: { "User-Agent": UA } },
      );
      const json = await res.json();
      if (json?.status !== 1 || !json?.product) {
        return NextResponse.json({ items: [], note: "Product not found." });
      }
      const hit = toHit(json.product);
      return NextResponse.json({ items: hit ? [hit] : [] });
    }

    if (!q) {
      return NextResponse.json(
        { error: "Provide a search query." },
        { status: 400 },
      );
    }

    const url =
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        q,
      )}` +
      `&search_simple=1&action=process&json=1&page_size=24` +
      `&fields=product_name,generic_name,brands,nutriments,serving_quantity,code`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((json?.products || []) as any[])
      .map(toHit)
      .filter((x): x is FoodHit => x !== null)
      .slice(0, 20);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Food search failed: ${message}` },
      { status: 502 },
    );
  }
}

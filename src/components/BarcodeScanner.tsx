"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useFoods } from "@/lib/store";
import { NumberInput } from "@/components/NumberInput";
import type { FoodHit } from "@/lib/foodsearch-types";

type Phase = "scanning" | "looking-up" | "found" | "notfound" | "error";

export function BarcodeScanner({ date }: { date: string }) {
  const { add } = useFoods();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [message, setMessage] = useState("");
  const [hit, setHit] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState(100);
  const [added, setAdded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lookedUp = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result && !lookedUp.current) {
              lookedUp.current = true;
              const code = result.getText();
              controlsRef.current?.stop();
              lookup(code);
            }
          },
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setPhase("error");
          setMessage(
            "Couldn't open the camera. Check permissions, or use Search instead.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function lookup(code: string) {
    setPhase("looking-up");
    try {
      const res = await fetch(`/api/foodsearch?barcode=${encodeURIComponent(code)}`);
      const data = (await res.json()) as { items?: FoodHit[] };
      const found = data.items?.[0];
      if (found) {
        setHit(found);
        setGrams(found.servingG || 100);
        setPhase("found");
      } else {
        setPhase("notfound");
        setMessage(`No product found for barcode ${code}.`);
      }
    } catch {
      setPhase("error");
      setMessage("Lookup failed. Try again or use Search.");
    }
  }

  function scaled(h: FoodHit, g: number) {
    const r = g / 100;
    return {
      calories: Math.round(h.per100.calories * r),
      protein: Math.round(h.per100.protein * r * 10) / 10,
      carbs: Math.round(h.per100.carbs * r * 10) / 10,
      fat: Math.round(h.per100.fat * r * 10) / 10,
    };
  }

  function addHit() {
    if (!hit) return;
    const s = scaled(hit, grams);
    add({
      date,
      name: hit.brand ? `${hit.name} (${hit.brand})` : hit.name,
      grams,
      ...s,
      source: "barcode",
    });
    setAdded(true);
    setTimeout(close, 700);
  }

  function rescan() {
    lookedUp.current = false;
    setHit(null);
    setMessage("");
    setPhase("scanning");
    setOpen(false);
    setTimeout(() => setOpen(true), 50);
  }

  function close() {
    controlsRef.current?.stop();
    setOpen(false);
    setPhase("scanning");
    setHit(null);
    setMessage("");
    setAdded(false);
    lookedUp.current = false;
  }

  return (
    <>
      <button
        className="btn btn-ghost w-full py-3"
        onClick={() => {
          lookedUp.current = false;
          setOpen(true);
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <path
            d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </svg>
        Scan barcode
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
          <div className="w-full sm:max-w-md card rounded-b-none sm:rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Scan barcode</h2>
              <button className="text-[var(--muted)] text-sm" onClick={close}>
                Close
              </button>
            </div>

            {(phase === "scanning" || phase === "looking-up") && (
              <>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-[var(--accent)]/80" />
                </div>
                <p className="text-xs text-[var(--muted)] text-center">
                  {phase === "looking-up"
                    ? "Looking up product…"
                    : "Point the camera at a product barcode."}
                </p>
              </>
            )}

            {phase === "found" && hit && (
              <div className="rounded-xl bg-[var(--surface-2)] p-3 space-y-3">
                <div>
                  <div className="font-medium">{hit.name}</div>
                  {hit.brand && (
                    <div className="text-[11px] text-[var(--muted)]">
                      {hit.brand}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <NumberInput
                    className="input py-1.5 w-20 text-center text-sm"
                    value={grams}
                    onChange={setGrams}
                    selectOnFocus
                    aria-label="grams"
                  />
                  <span className="text-xs text-[var(--muted)]">g</span>
                  <div className="flex-1 text-xs text-[var(--muted)]">
                    {(() => {
                      const s = scaled(hit, grams);
                      return `${s.calories} kcal · P ${s.protein} · C ${s.carbs} · F ${s.fat}`;
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-ghost py-2.5" onClick={rescan}>
                    Scan again
                  </button>
                  <button className="btn btn-primary py-2.5" onClick={addHit}>
                    {added ? "Added ✓" : "Add"}
                  </button>
                </div>
              </div>
            )}

            {(phase === "notfound" || phase === "error") && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)]">{message}</p>
                <button className="btn btn-ghost w-full py-2.5" onClick={rescan}>
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

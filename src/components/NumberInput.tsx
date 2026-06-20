"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A numeric input that you can actually clear. Plain controlled number inputs
 * that coerce empty -> 0 snap a "0" back in and trap the cursor; this keeps a
 * local string so the field can be empty while typing, and reports 0 to the
 * parent for calculations. It also stays in sync when the value changes from
 * outside (e.g. macros recalculated when grams change).
 */
export function NumberInput({
  value,
  onChange,
  className,
  placeholder,
  min,
  max,
  step,
  selectOnFocus,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  selectOnFocus?: boolean;
  "aria-label"?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(v) : "");
  const [text, setText] = useState<string>(fmt(value));
  const lastNum = useRef<number>(value);

  // Reflect external changes (but don't fight the user mid-edit).
  useEffect(() => {
    if (value !== lastNum.current) {
      setText(fmt(value));
      lastNum.current = value;
    }
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);
    if (raw === "" || raw === "-" || raw === ".") {
      lastNum.current = 0;
      onChange(0);
      return;
    }
    const n = parseFloat(raw);
    if (Number.isFinite(n)) {
      lastNum.current = n;
      onChange(n);
    }
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={selectOnFocus ? (e) => e.currentTarget.select() : undefined}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setText(fmt(lastNum.current))}
    />
  );
}

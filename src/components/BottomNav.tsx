"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  {
    href: "/trends",
    label: "Trends",
    icon: "M4 19V5m0 14h16M7 15l4-5 3 3 5-7",
  },
  {
    href: "/gym",
    label: "Gym",
    icon: "M6.5 6.5l-2 2M17.5 6.5l2 2M4 12h16M7 12v6m10-6v6M9 18h6",
  },
  {
    href: "/weight",
    label: "Weight",
    icon: "M4 7h16l-2 13H6L4 7zm4 0V5a4 4 0 018 0v2",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm8-3a8 8 0 01-.2 1.8l2 1.6-2 3.4-2.4-1a8 8 0 01-3 1.8L12 23H8l-.4-2.6a8 8 0 01-3-1.8l-2.4 1-2-3.4 2-1.6A8 8 0 014 12",
  },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto max-w-md grid grid-cols-5 px-1 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {items.map((it) => {
          const active = path === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex flex-col items-center gap-1 py-1.5"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <path
                  d={it.icon}
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[10px] font-medium">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

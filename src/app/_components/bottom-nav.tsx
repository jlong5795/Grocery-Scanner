"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" || p.startsWith("/scan") || p.startsWith("/review") },
  { href: "/list", label: "List", match: (p: string) => p.startsWith("/list") || p.startsWith("/sub") },
  { href: "/history", label: "History", match: (p: string) => p.startsWith("/history") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 items-center justify-center text-base font-semibold ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

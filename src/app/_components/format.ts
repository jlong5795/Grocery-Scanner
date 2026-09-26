const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "today", "yesterday", "3 days ago", "2 weeks ago". */
export function relativeDay(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = new Date(date);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (days > -7) return rtf.format(days, "day");
  if (days > -60) return rtf.format(Math.round(days / 7), "week");
  return rtf.format(Math.round(days / 30), "month");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function money(cents: number | null | undefined): string | null {
  return cents == null ? null : `$${(cents / 100).toFixed(2)}`;
}

export function firstName(user: { name?: string | null; email?: string | null } | null | undefined) {
  return user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "Someone";
}

export const STORAGE_LABEL = { REFRIGERATED: "Refrigerated", DRY: "Dry goods" } as const;
export const STORAGE_HINT = {
  REFRIGERATED: "Fridge + freezer",
  DRY: "Pantry + cabinets",
} as const;

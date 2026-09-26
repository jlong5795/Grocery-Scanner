"use client";

import { useState } from "react";

import { STORAGE_LABEL, relativeDay } from "~/app/_components/format";
import { api } from "~/trpc/react";

import { Section } from "./section";

/** Browse the catalog and un-ignore items marked "Don't restock". */
export function CatalogSection() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const items = api.pantryItem.list.useQuery({
    search: search.trim() || undefined,
    ignored: ignoredOnly ? true : undefined,
  });
  const setIgnored = api.pantryItem.setIgnored.useMutation({
    onSuccess: () => utils.pantryItem.list.invalidate(),
  });

  return (
    <Section title="Catalog" hint="Everything the scanner has seen. Ignored items are never flagged as missing.">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search"
        className="rounded-xl border border-line px-3 py-2 text-lg"
      />
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={ignoredOnly} onChange={(e) => setIgnoredOnly(e.target.checked)} />
        Show ignored only
      </label>
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {items.data?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{item.displayName}</p>
              <p className="text-sm text-muted">
                {STORAGE_LABEL[item.storageType]} · seen {relativeDay(item.lastSeenAt)}
              </p>
            </div>
            <button
              onClick={() => setIgnored.mutate({ itemId: item.id, ignored: !item.ignored })}
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${
                item.ignored ? "border-warn text-warn" : "border-line text-muted"
              }`}
            >
              {item.ignored ? "Ignored" : "Ignore"}
            </button>
          </li>
        ))}
        {items.data?.length === 0 && <li className="text-muted">No items yet.</li>}
      </ul>
    </Section>
  );
}

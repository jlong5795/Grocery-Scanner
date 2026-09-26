"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

import { firstName } from "./format";
import { Button } from "./ui";

/** Add to the open shopping list from anywhere, with catalog / past-list suggestions. */
export function QuickAdd({ autoFocus = false }: { autoFocus?: boolean }) {
  const utils = api.useUtils();
  const [label, setLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const suggestions = api.groceryList.suggestions.useQuery(
    { query: label },
    { enabled: label.trim().length >= 2 },
  );
  const add = api.groceryList.addItem.useMutation({
    onSuccess: async ({ item, duplicate }) => {
      setNotice(
        duplicate
          ? `${item.label} is already on the list (added by ${firstName(item.addedBy)}).`
          : `Added ${item.label}.`,
      );
      setLabel("");
      await utils.groceryList.getOpen.invalidate();
    },
  });

  const submit = (value: string, sourceItemId?: string | null) => {
    if (!value.trim()) return;
    add.mutate({ label: value.trim(), sourceItemId: sourceItemId ?? undefined });
  };

  const options = label.trim().length >= 2 ? (suggestions.data ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(label);
        }}
      >
        <input
          value={label}
          autoFocus={autoFocus}
          onChange={(e) => {
            setLabel(e.target.value);
            setNotice(null);
          }}
          placeholder="Add to the list…"
          aria-label="Add to the shopping list"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-lg"
        />
        <Button type="submit" disabled={add.isPending || !label.trim()}>
          Add
        </Button>
      </form>
      {options.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {options.map((o) => (
            <li key={`${o.label}-${o.sourceItemId}`}>
              <button
                type="button"
                onClick={() => submit(o.label, o.sourceItemId)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-base"
              >
                + {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="text-muted">{notice}</p>}
      {add.error && <p className="text-danger">{add.error.message}</p>}
    </div>
  );
}

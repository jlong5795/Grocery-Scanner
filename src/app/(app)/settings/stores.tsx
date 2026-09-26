"use client";

import { useState } from "react";

import { Button, ErrorNote } from "~/app/_components/ui";
import { api } from "~/trpc/react";

import { Section } from "./section";

export function StoresSection() {
  const utils = api.useUtils();
  const stores = api.store.list.useQuery();
  const refresh = () => utils.store.list.invalidate();
  const create = api.store.create.useMutation({
    onSuccess: async () => {
      setName("");
      setAdapterKey("");
      await refresh();
    },
  });
  const move = api.store.move.useMutation({ onSuccess: refresh });
  const remove = api.store.delete.useMutation({ onSuccess: refresh });
  const [name, setName] = useState("");
  const [adapterKey, setAdapterKey] = useState("");

  return (
    <Section
      title="Stores"
      hint="Where deals are checked. Order breaks ties when two stores have the same price."
    >
      <ul className="flex flex-col gap-2">
        {stores.data?.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.name}</p>
              <p className="truncate text-sm text-muted">{s.adapterKey}</p>
            </div>
            <button
              aria-label={`Move ${s.name} up`}
              disabled={i === 0}
              onClick={() => move.mutate({ storeId: s.id, direction: "up" })}
              className="h-10 w-10 rounded-xl border border-line disabled:opacity-30"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${s.name} down`}
              disabled={i === (stores.data?.length ?? 0) - 1}
              onClick={() => move.mutate({ storeId: s.id, direction: "down" })}
              className="h-10 w-10 rounded-xl border border-line disabled:opacity-30"
            >
              ↓
            </button>
            <button
              aria-label={`Remove ${s.name}`}
              onClick={() => remove.mutate({ storeId: s.id })}
              className="h-10 w-10 rounded-xl border border-line text-danger"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, adapterKey: adapterKey || `flipp:${name}` });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Store name (e.g. Kroger)"
          required
          className="rounded-xl border border-line px-3 py-2 text-lg"
        />
        <input
          value={adapterKey}
          onChange={(e) => setAdapterKey(e.target.value)}
          placeholder={name ? `Source (default: flipp:${name})` : "Source (default: flipp:<store name>)"}
          className="rounded-xl border border-line px-3 py-2 text-lg"
        />
        {create.error && <ErrorNote>{create.error.message}</ErrorNote>}
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          Add store
        </Button>
      </form>
    </Section>
  );
}

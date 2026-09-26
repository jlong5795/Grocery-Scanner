"use client";

import { useState } from "react";

import { QuickAdd } from "~/app/_components/quick-add";
import { firstName } from "~/app/_components/format";
import { Button, Card, EmptyState, ErrorNote, PageHeader, Spinner } from "~/app/_components/ui";
import { type RouterOutputs, api } from "~/trpc/react";

import { ShoppingView } from "./shopping-view";

type OpenList = NonNullable<RouterOutputs["groceryList"]["getOpen"]>;

export default function ListPage() {
  const list = api.groceryList.getOpen.useQuery(undefined, { refetchInterval: 10_000 });

  if (list.isLoading) return <div className="p-6"><Spinner label="Loading list…" /></div>;

  if (!list.data) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Shopping list" />
        <div className="px-4">
          <QuickAdd autoFocus />
        </div>
        <EmptyState>Nothing on the list. Add something, or scan to find what&apos;s run out.</EmptyState>
      </main>
    );
  }

  return list.data.status === "SHOPPING" ? (
    <ShoppingView listId={list.data.id} />
  ) : (
    <EditableList list={list.data} />
  );
}

function EditableList({ list }: { list: OpenList }) {
  const utils = api.useUtils();
  const start = api.groceryList.startShopping.useMutation({
    onSuccess: () => utils.groceryList.getOpen.invalidate(),
  });

  return (
    <main className="flex flex-col gap-3 pb-28">
      <PageHeader title="Shopping list" />
      <div className="px-4">
        <QuickAdd />
      </div>
      <ul className="flex flex-col gap-2 px-4">
        {list.items.map((item) => (
          <ListRow key={item.id} item={item} />
        ))}
      </ul>
      {start.error && <div className="px-4"><ErrorNote>{start.error.message}</ErrorNote></div>}
      <div className="bottom-safe fixed inset-x-0 bottom-16 z-10 mx-auto max-w-lg px-4 pb-3">
        <Button
          size="lg"
          className="w-full shadow-lg"
          disabled={start.isPending || list.items.length === 0}
          onClick={() => start.mutate({ listId: list.id })}
        >
          Start shopping
        </Button>
      </div>
    </main>
  );
}

function ListRow({ item }: { item: OpenList["items"][number] }) {
  const utils = api.useUtils();
  const stores = api.store.list.useQuery();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [pinned, setPinned] = useState(item.pinnedStoreId ?? "");
  const refresh = () => utils.groceryList.getOpen.invalidate();
  const update = api.groceryList.updateItem.useMutation({ onSuccess: async () => { await refresh(); setOpen(false); } });
  const remove = api.groceryList.removeItem.useMutation({ onSuccess: refresh });

  return (
    <li>
      <Card className="flex flex-col gap-3">
        <button className="flex items-start justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              {item.label}
              {item.quantity && <span className="font-normal text-muted"> · {item.quantity}</span>}
            </p>
            {item.notes && <p className="text-muted">{item.notes}</p>}
            <p className="text-sm text-muted">
              Added by {firstName(item.addedBy)}
              {item.pinnedStore && ` · ${item.pinnedStore.name}`}
            </p>
          </div>
          <span className="text-muted" aria-hidden>
            {open ? "▴" : "▾"}
          </span>
        </button>

        {open && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({
                itemId: item.id,
                quantity: quantity.trim() || null,
                notes: notes.trim() || null,
                pinnedStoreId: pinned || null,
              });
            }}
          >
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantity (e.g. 2, 1 lb)"
              className="rounded-xl border border-line px-3 py-2 text-lg"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='Notes (e.g. "the low-sodium one")'
              className="rounded-xl border border-line px-3 py-2 text-lg"
            />
            {(stores.data?.length ?? 0) > 0 && (
              <select
                value={pinned}
                onChange={(e) => setPinned(e.target.value)}
                aria-label="Store for this trip"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-lg"
              >
                <option value="">Any store (best deal)</option>
                {stores.data!.map((s) => (
                  <option key={s.id} value={s.id}>
                    Buy at {s.name}
                  </option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" disabled={update.isPending}>
                Save
              </Button>
              <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ itemId: item.id })}>
                Remove
              </Button>
            </div>
          </form>
        )}
      </Card>
    </li>
  );
}

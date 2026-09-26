"use client";

import { useState } from "react";

import { QuickAdd } from "~/app/_components/quick-add";
import { firstName, money } from "~/app/_components/format";
import { Badge, Button, Card, ErrorNote, Spinner } from "~/app/_components/ui";
import { type RouterOutputs, api } from "~/trpc/react";

type View = RouterOutputs["groceryList"]["shoppingView"];
type Row = View["groups"][number]["departments"][number]["items"][number];

/** In the store: grouped by store then department, check off, ask about substitutes. */
export function ShoppingView({ listId }: { listId: string }) {
  const view = api.groceryList.shoppingView.useQuery({ listId }, { refetchInterval: 5_000 });
  const me = api.household.me.useQuery();
  const [finishing, setFinishing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (view.isLoading) return <div className="p-6"><Spinner label="Loading…" /></div>;
  if (!view.data) return null;

  const all = view.data.groups.flatMap((g) => g.departments.flatMap((d) => d.items));
  const left = all.filter((i) => !i.checkedAt);
  const noDeals = all.every((i) => i.dealMatches.length === 0);

  return (
    <main className="flex flex-col pb-28">
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Shopping</h1>
        <p className="text-muted">
          {left.length} of {all.length} left
        </p>
        {noDeals && all.length > 0 && <p className="mt-1 text-sm text-muted">Checking stores for deals…</p>}
      </header>

      <div className="px-4 pb-2">
        {adding ? <QuickAdd autoFocus /> : (
          <button className="font-semibold text-brand" onClick={() => setAdding(true)}>
            + Add an item
          </button>
        )}
      </div>

      {view.data.groups.map((group) => (
        <section key={group.storeId ?? "any"}>
          <h2 className="sticky top-0 z-10 bg-canvas px-4 py-2 text-xl font-bold">{group.storeName}</h2>
          {group.departments.map((dept) => (
            <div key={dept.name} className="px-4 pb-3">
              <h3 className="py-1 text-sm font-semibold tracking-wide text-muted uppercase">{dept.name}</h3>
              <ul className="flex flex-col gap-2">
                {dept.items.map((item) => (
                  <ShoppingRow key={item.id} item={item} listId={listId} myId={me.data?.id} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <div className="bottom-safe fixed inset-x-0 bottom-16 z-10 mx-auto max-w-lg px-4 pb-3">
        {finishing ? (
          <FinishTrip listId={listId} unchecked={left} onCancel={() => setFinishing(false)} />
        ) : (
          <Button size="lg" className="w-full shadow-lg" onClick={() => setFinishing(true)}>
            Finish trip
          </Button>
        )}
      </div>
    </main>
  );
}

function ShoppingRow({ item, listId, myId }: { item: Row; listId: string; myId?: string }) {
  const utils = api.useUtils();
  const [asking, setAsking] = useState(false);
  const check = api.groceryList.checkItem.useMutation({
    onSuccess: () => utils.groceryList.shoppingView.invalidate({ listId }),
  });
  const checked = !!item.checkedAt;
  const deal = item.chosenDeal;
  const latestAsk = item.substitutions[0];

  return (
    <li>
      <Card className={`flex flex-col gap-2 ${checked ? "opacity-50" : ""}`}>
        <div className="flex items-start gap-3">
          <button
            role="checkbox"
            aria-checked={checked}
            aria-label={`${checked ? "Uncheck" : "Check off"} ${item.label}`}
            disabled={check.isPending}
            onClick={() => check.mutate({ itemId: item.id, checked: !checked })}
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 text-xl font-bold ${
              checked ? "border-brand bg-brand text-white" : "border-muted bg-surface"
            }`}
          >
            {checked && "✓"}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`text-lg font-semibold ${checked ? "line-through" : ""}`}>
              {item.label}
              {item.quantity && <span className="font-normal text-muted"> · {item.quantity}</span>}
            </p>
            {item.notes && <p className="text-muted">{item.notes}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{firstName(item.addedBy)}</span>
              {deal?.priceCents != null && <span className="font-semibold text-ink">{money(deal.priceCents)}</span>}
              {deal?.wasPriceCents != null && <Badge>Sale, was {money(deal.wasPriceCents)}</Badge>}
              {deal?.couponSummary && <Badge>{deal.couponSummary}</Badge>}
            </div>
          </div>
        </div>

        {latestAsk && (
          <p
            className={`rounded-xl px-3 py-2 ${
              latestAsk.status === "PENDING"
                ? "bg-canvas text-muted"
                : latestAsk.status === "APPROVED"
                  ? "bg-brand-soft text-brand-strong"
                  : "bg-warn-soft text-warn"
            }`}
          >
            {latestAsk.status === "PENDING"
              ? `Waiting on ${firstName(latestAsk.askedTo)}…`
              : `${firstName(latestAsk.askedTo)}: ${latestAsk.status === "APPROVED" ? "Yes" : "No"}${latestAsk.reply ? `, "${latestAsk.reply}"` : ""}`}
          </p>
        )}

        {/* Only someone else can be asked about their item. */}
        {!checked &&
          myId !== undefined &&
          item.addedBy.id !== myId &&
          (asking ? (
            <AskForm itemId={item.id} listId={listId} name={firstName(item.addedBy)} onDone={() => setAsking(false)} />
          ) : (
            <button className="self-start font-semibold text-brand" onClick={() => setAsking(true)}>
              Ask {firstName(item.addedBy)} about a substitute
            </button>
          ))}
      </Card>
    </li>
  );
}

const REASONS = [
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "AMBIGUOUS", label: "Which one?" },
  { value: "OTHER", label: "Other" },
] as const;

function AskForm({ itemId, listId, name, onDone }: { itemId: string; listId: string; name: string; onDone: () => void }) {
  const utils = api.useUtils();
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("OUT_OF_STOCK");
  const [proposal, setProposal] = useState("");
  const ask = api.substitution.ask.useMutation({
    onSuccess: async () => {
      await utils.groceryList.shoppingView.invalidate({ listId });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        ask.mutate({ groceryItemId: itemId, reason, proposal: proposal.trim() || undefined });
      }}
    >
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setReason(r.value)}
            className={`rounded-full border px-3 py-1.5 ${reason === r.value ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        value={proposal}
        onChange={(e) => setProposal(e.target.value)}
        placeholder="Suggest a substitute (optional)"
        className="rounded-xl border border-line px-3 py-2 text-lg"
      />
      {ask.error && <ErrorNote>{ask.error.message}</ErrorNote>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={ask.isPending}>
          Ask {name}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FinishTrip({ listId, unchecked, onCancel }: { listId: string; unchecked: Row[]; onCancel: () => void }) {
  const utils = api.useUtils();
  const [carry, setCarry] = useState<Set<string>>(() => new Set(unchecked.map((i) => i.id)));
  const finish = api.groceryList.finishTrip.useMutation({
    onSuccess: () => utils.groceryList.invalidate(),
  });

  const toggle = (id: string) =>
    setCarry((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto shadow-lg">
      <p className="text-lg font-bold">Finish this trip?</p>
      {unchecked.length > 0 ? (
        <>
          <p className="text-muted">These weren&apos;t checked off. Keep the ticked ones for next time:</p>
          <ul className="flex flex-col gap-1">
            {unchecked.map((i) => (
              <li key={i.id}>
                <label className="flex items-center gap-3 py-1 text-lg">
                  <input type="checkbox" className="h-6 w-6" checked={carry.has(i.id)} onChange={() => toggle(i.id)} />
                  {i.label}
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted">Everything was checked off.</p>
      )}
      {finish.error && <ErrorNote>{finish.error.message}</ErrorNote>}
      <Button size="lg" disabled={finish.isPending} onClick={() => finish.mutate({ listId, carryOver: [...carry] })}>
        Finish trip
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Keep shopping
      </Button>
    </Card>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { STORAGE_LABEL, relativeDay } from "~/app/_components/format";
import { Button, Card, EmptyState, ErrorNote, LinkButton, PageHeader, Spinner } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p-6"><Spinner /></div>}>
      <NotSpottedReview />
    </Suspense>
  );
}

/** Flow B: items seen before but not in today's scan. Nothing changes without a tap. */
function NotSpottedReview() {
  const params = useSearchParams();
  const type = params.get("type") === "REFRIGERATED" ? "REFRIGERATED" : params.get("type") === "DRY" ? "DRY" : undefined;
  const utils = api.useUtils();
  const items = api.pantryItem.notSpotted.useQuery({ storageType: type });

  const refresh = async () => {
    await Promise.all([
      utils.pantryItem.notSpotted.invalidate(),
      utils.pantryItem.notSpottedCounts.invalidate(),
      utils.groceryList.getOpen.invalidate(),
    ]);
  };
  const confirm = api.pantryItem.confirmMissing.useMutation({ onSuccess: refresh });
  const dismiss = api.pantryItem.dismissMissing.useMutation({ onSuccess: refresh });
  const snooze = api.pantryItem.snooze.useMutation({ onSuccess: refresh });
  const ignore = api.pantryItem.setIgnored.useMutation({ onSuccess: refresh });
  const busy = confirm.isPending || dismiss.isPending || snooze.isPending || ignore.isPending;
  const error = confirm.error ?? dismiss.error ?? snooze.error ?? ignore.error;

  const current = items.data?.[0];
  const remaining = items.data?.length ?? 0;

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="Not spotted this time" />
      {type && <p className="-mt-2 px-4 text-muted">{STORAGE_LABEL[type]}</p>}

      {items.isLoading && <div className="px-4"><Spinner /></div>}

      {!items.isLoading && !current && (
        <div className="flex flex-col gap-4 px-4">
          <EmptyState>All caught up.</EmptyState>
          <LinkButton href="/list">See the shopping list</LinkButton>
          <LinkButton href="/" variant="secondary">
            Home
          </LinkButton>
        </div>
      )}

      {current && (
        <div className="flex flex-col gap-4 px-4">
          <p className="text-muted">{remaining} left to go through</p>
          <Card className="flex flex-col gap-4">
            {current.photoSrc && (
              <img src={current.photoSrc} alt="" className="max-h-64 w-full rounded-xl object-cover" />
            )}
            <div>
              <p className="text-2xl font-bold">{current.displayName}</p>
              <p className="text-muted">Last seen {relativeDay(current.lastSeenAt)}</p>
            </div>
            {error && <ErrorNote>{error.message}</ErrorNote>}
            <Button size="lg" disabled={busy} onClick={() => confirm.mutate({ itemId: current.id })}>
              Gone, add to list
            </Button>
            <Button size="lg" variant="secondary" disabled={busy} onClick={() => dismiss.mutate({ itemId: current.id })}>
              Still have it
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => snooze.mutate({ itemId: current.id })}>
                Ask next scan
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => ignore.mutate({ itemId: current.id, ignored: true })}
              >
                Don&apos;t restock
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

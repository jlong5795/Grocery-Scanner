"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QuickAdd } from "~/app/_components/quick-add";
import { STORAGE_HINT, STORAGE_LABEL, firstName, relativeDay } from "~/app/_components/format";
import { Badge, Button, Card, ErrorNote } from "~/app/_components/ui";
import { api } from "~/trpc/react";

const TYPES = ["REFRIGERATED", "DRY"] as const;

export default function HomePage() {
  const router = useRouter();
  const latest = api.scan.latest.useQuery();
  const pending = api.pantryItem.notSpottedCounts.useQuery();
  const openList = api.groceryList.getOpen.useQuery();
  const questions = api.substitution.pendingForMe.useQuery(undefined, { refetchInterval: 15_000 });
  const [choosing, setChoosing] = useState(false);
  const start = api.scan.start.useMutation({
    onSuccess: (scan) => router.push(`/scan/${scan.id}`),
  });

  const toBuy = openList.data?.items.filter((i) => !i.checkedAt).length ?? 0;

  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold">Pantry</h1>

      {questions.data?.map((q) => (
        <Link key={q.id} href={`/sub/${q.id}`}>
          <Card className="border-2 border-warn">
            <p className="font-semibold text-warn">
              {firstName(q.askedBy)} is asking about {q.groceryItem.label}
            </p>
            <p className="text-muted">Tap to answer</p>
          </Card>
        </Link>
      ))}

      <div className="grid grid-cols-2 gap-3">
        {TYPES.map((t) => {
          const count = pending.data?.[t] ?? 0;
          return (
            <Card key={t} className="flex flex-col gap-1">
              <p className="text-lg font-bold">{STORAGE_LABEL[t]}</p>
              <p className="text-sm text-muted">{STORAGE_HINT[t]}</p>
              <p className="mt-2 text-sm">Scanned {relativeDay(latest.data?.[t])}</p>
              {count > 0 && (
                <Link href={`/review?type=${t}`} className="mt-1">
                  <Badge tone="warn">{count} not spotted</Badge>
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      <Link href="/list">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">Shopping list</p>
            <p className="text-muted">
              {openList.data
                ? `${toBuy} to buy${openList.data.status === "SHOPPING" ? " · trip in progress" : ""}`
                : "Nothing on the list"}
            </p>
          </div>
          <span className="text-2xl text-muted" aria-hidden>
            ›
          </span>
        </Card>
      </Link>

      <QuickAdd />

      {start.error && <ErrorNote>{start.error.message}</ErrorNote>}

      <div className="bottom-safe fixed inset-x-0 bottom-16 z-10 mx-auto max-w-lg px-4 pb-3">
        {choosing ? (
          <Card className="flex flex-col gap-2 shadow-lg">
            <p className="font-semibold">What are you scanning?</p>
            {TYPES.map((t) => (
              <Button
                key={t}
                size="lg"
                disabled={start.isPending}
                onClick={() => start.mutate({ storageType: t })}
              >
                {STORAGE_LABEL[t]} <span className="font-normal opacity-80">· {STORAGE_HINT[t]}</span>
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </Card>
        ) : (
          <Button size="lg" className="w-full shadow-lg" onClick={() => setChoosing(true)}>
            Scan
          </Button>
        )}
      </div>
    </main>
  );
}

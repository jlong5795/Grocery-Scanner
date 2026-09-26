"use client";

import Link from "next/link";

import { Card, EmptyState, PageHeader, Spinner } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export default function HistoryPage() {
  const history = api.groceryList.history.useQuery();

  return (
    <main className="flex flex-col gap-3">
      <PageHeader title="Past trips" />
      {history.isLoading && <div className="px-4"><Spinner /></div>}
      {history.data?.length === 0 && <EmptyState>No finished trips yet.</EmptyState>}
      <ul className="flex flex-col gap-2 px-4">
        {history.data?.map((trip) => (
          <li key={trip.id}>
            <Link href={`/history/${trip.id}`}>
              <Card>
                <p className="text-lg font-semibold">
                  {trip.completedAt?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <p className="text-muted">
                  {trip.checked} of {trip.total} bought
                  {trip.shoppers.length > 0 && ` · ${trip.shoppers.join(", ")}`}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

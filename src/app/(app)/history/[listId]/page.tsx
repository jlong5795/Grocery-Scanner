"use client";

import { useParams } from "next/navigation";

import { firstName } from "~/app/_components/format";
import { Card, PageHeader, Spinner } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export default function TripPage() {
  const { listId } = useParams<{ listId: string }>();
  const list = api.groceryList.get.useQuery({ listId });

  if (!list.data) return <div className="p-6"><Spinner /></div>;
  const title =
    list.data.completedAt?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) ??
    "Current list";

  return (
    <main className="flex flex-col gap-3">
      <PageHeader title={title} />
      <ul className="flex flex-col gap-2 px-4">
        {list.data.items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-lg font-semibold ${item.checkedAt ? "" : "text-muted"}`}>{item.label}</p>
                <p className="text-sm text-muted">
                  Added by {firstName(item.addedBy)}
                  {item.checkedBy && ` · bought by ${firstName(item.checkedBy)}`}
                </p>
              </div>
              <span className="text-xl" aria-label={item.checkedAt ? "Bought" : "Not bought"}>
                {item.checkedAt ? "✓" : "–"}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}

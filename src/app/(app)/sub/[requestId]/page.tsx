"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { firstName } from "~/app/_components/format";
import { Button, Card, ErrorNote, LinkButton, PageHeader, Spinner } from "~/app/_components/ui";
import { api } from "~/trpc/react";

const REASON = {
  OUT_OF_STOCK: "is out of stock",
  AMBIGUOUS: "has a few options",
  OTHER: "needs a decision",
} as const;

/** Opened from the push notification: the requester answers the shopper. */
export default function SubstitutionPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const utils = api.useUtils();
  const request = api.substitution.get.useQuery({ requestId });
  const me = api.household.me.useQuery();
  const [reply, setReply] = useState("");
  const answer = api.substitution.answer.useMutation({
    onSuccess: () =>
      Promise.all([utils.substitution.get.invalidate({ requestId }), utils.substitution.pendingForMe.invalidate()]),
  });

  if (request.isLoading) return <div className="p-6"><Spinner /></div>;
  if (!request.data) return <div className="p-6"><ErrorNote>Request not found.</ErrorNote></div>;
  const r = request.data;
  const mine = me.data?.id === r.askedTo.id;

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="Substitute?" />
      <div className="flex flex-col gap-4 px-4">
        <Card className="flex flex-col gap-2">
          <p className="text-2xl font-bold">
            {r.groceryItem.label} {REASON[r.reason]}
          </p>
          {(r.groceryItem.quantity ?? r.groceryItem.notes) && (
            <p className="text-muted">
              Your note: {[r.groceryItem.quantity, r.groceryItem.notes].filter(Boolean).join(" · ")}
            </p>
          )}
          {r.proposal && (
            <p className="text-lg">
              {firstName(r.askedBy)} suggests: <span className="font-semibold">{r.proposal}</span>
            </p>
          )}
        </Card>

        {r.status !== "PENDING" ? (
          <Card>
            <p className="text-lg font-semibold">
              {r.status === "APPROVED" ? "You said yes" : "You said no"}
              {r.reply && `: "${r.reply}"`}
            </p>
          </Card>
        ) : mine ? (
          <>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder='Add a note (e.g. "get the crunchy one")'
              className="rounded-2xl border border-line bg-surface px-4 py-3 text-lg"
            />
            {answer.error && <ErrorNote>{answer.error.message}</ErrorNote>}
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ requestId, approved: true, reply: reply || undefined })}
              >
                Yes
              </Button>
              <Button
                size="lg"
                variant="danger"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ requestId, approved: false, reply: reply || undefined })}
              >
                No
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted">Waiting on {firstName(r.askedTo)} to answer.</p>
        )}
        <LinkButton href="/list" variant="secondary">
          Shopping list
        </LinkButton>
      </div>
    </main>
  );
}

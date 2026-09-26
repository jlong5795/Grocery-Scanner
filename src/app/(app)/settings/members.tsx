"use client";

import { api } from "~/trpc/react";

import { Section } from "./section";

export function MembersSection() {
  const members = api.household.members.useQuery();
  return (
    <Section title="Household" hint="Members are set by the HOUSEHOLD_EMAILS setting on the server.">
      <ul className="flex flex-col gap-2">
        {members.data?.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{m.user?.name ?? m.email}</span>
            <span className="text-sm text-muted">{m.user ? "Joined" : "Hasn't signed in"}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

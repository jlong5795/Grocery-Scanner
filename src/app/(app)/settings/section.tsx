import type { ReactNode } from "react";

import { Card } from "~/app/_components/ui";

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      {hint && <p className="text-muted">{hint}</p>}
      <Card className="flex flex-col gap-3">{children}</Card>
    </section>
  );
}

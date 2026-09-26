import { redirect } from "next/navigation";

import { BottomNav } from "~/app/_components/bottom-nav";
import { PushSync } from "~/app/_components/push-sync";
import { auth } from "~/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="pb-nav mx-auto min-h-dvh max-w-lg">
      {children}
      <BottomNav />
      <PushSync />
    </div>
  );
}

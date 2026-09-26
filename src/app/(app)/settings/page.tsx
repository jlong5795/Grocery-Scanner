import { signOut } from "~/server/auth";

import { CatalogSection } from "./catalog";
import { MembersSection } from "./members";
import { NotificationsSection } from "./notifications";
import { StoresSection } from "./stores";

export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-6 px-4 pt-6 pb-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <NotificationsSection />
      <StoresSection />
      <CatalogSection />
      <MembersSection />
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button className="w-full rounded-2xl border border-line bg-surface px-4 py-3 font-semibold text-danger">
          Sign out
        </button>
      </form>
    </main>
  );
}

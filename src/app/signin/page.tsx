import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "~/server/auth";
import { authProviders } from "~/server/auth/config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-3xl font-bold">Pantry Scanner</h1>
        <p className="mt-2 text-muted">Sign in with a household account.</p>
      </div>

      {error && (
        <p className="rounded-xl bg-warn-soft p-4 text-warn" role="alert">
          {error === "AccessDenied"
            ? "That account isn't on the household list. Ask whoever set up the app to add your email."
            : "Sign-in didn't work. Try again."}
        </p>
      )}

      {authProviders.google && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-2xl bg-brand px-6 py-4 text-lg font-semibold text-white active:bg-brand-strong">
            Continue with Google
          </button>
        </form>
      )}

      {authProviders.dev && (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-dashed border-line p-4"
          action={async (form: FormData) => {
            "use server";
            try {
              await signIn("dev", { email: form.get("email"), redirectTo: "/" });
            } catch (err) {
              // A refused login throws; a successful one throws Next's redirect, which must propagate.
              if (err instanceof AuthError) redirect("/signin?error=AccessDenied");
              throw err;
            }
          }}
        >
          <label className="text-sm font-medium text-muted" htmlFor="email">
            Dev login (local only)
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="rounded-xl border border-line bg-surface px-4 py-3 text-lg"
          />
          <button className="rounded-xl bg-ink px-4 py-3 font-semibold text-white">Sign in</button>
        </form>
      )}

      {!authProviders.google && !authProviders.dev && (
        <p className="text-muted">
          No sign-in method is configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or
          AUTH_DEV_LOGIN=true for local development.
        </p>
      )}
    </main>
  );
}

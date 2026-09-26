import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { env } from "~/env";
import { db } from "~/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export function isHouseholdEmail(email: string | null | undefined) {
  return !!email && env.HOUSEHOLD_EMAILS.includes(email.toLowerCase());
}

const devLoginEnabled = env.AUTH_DEV_LOGIN && env.NODE_ENV !== "production";

const providers: Provider[] = [GoogleProvider];

if (devLoginEnabled) {
  // Local development only: sign in as any household email without a password.
  providers.push(
    CredentialsProvider({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        if (!isHouseholdEmail(email)) return null;
        return db.user.upsert({
          where: { email },
          update: {},
          create: { email, name: email.split("@")[0] },
        });
      },
    }),
  );
}

export const authConfig = {
  providers,
  adapter: PrismaAdapter(db),
  // JWT sessions so the dev Credentials provider works alongside OAuth.
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    // Only household members may sign in.
    signIn: ({ user }) => isHouseholdEmail(user.email),
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub!,
      },
    }),
  },
} satisfies NextAuthConfig;

export const authProviders = {
  google: !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
  dev: devLoginEnabled,
};

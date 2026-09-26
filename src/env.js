import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    // Comma-separated emails of household members. Anyone else is refused at sign-in.
    HOUSEHOLD_EMAILS: z
      .string()
      .default("")
      .transform((s) =>
        s
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    // "true" enables a passwordless email sign-in for local development. Ignored in production.
    AUTH_DEV_LOGIN: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    DATABASE_URL: z.string().url(),
    // Read by the Anthropic SDK directly; listed here so a missing key is visible at startup.
    ANTHROPIC_API_KEY: z.string().optional(),
    VISION_MODEL: z.string().default("claude-opus-5"),
    // Vercel Blob for scan photos. Without it, photos are written to ./.data/uploads (dev only).
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
    // Postal code used by the Flipp weekly-ad adapter.
    HOUSEHOLD_POSTAL_CODE: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    HOUSEHOLD_EMAILS: process.env.HOUSEHOLD_EMAILS,
    AUTH_DEV_LOGIN: process.env.AUTH_DEV_LOGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    VISION_MODEL: process.env.VISION_MODEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    HOUSEHOLD_POSTAL_CODE: process.env.HOUSEHOLD_POSTAL_CODE,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

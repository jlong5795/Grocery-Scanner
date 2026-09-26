import "server-only";

import webpush, { WebPushError } from "web-push";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Web Push (spec section 9). The browser's push service (Google, Mozilla or
 * Apple) wakes our service worker (public/sw.js), which shows the
 * notification. Payloads stay small: a title, a body and a link.
 */

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

let configured: boolean | undefined;
function ensureConfigured() {
  if (configured !== undefined) return configured;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  configured = !!(publicKey && privateKey);
  if (configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey!, privateKey!);
  } else {
    console.warn("[push] VAPID keys not set; push notifications are disabled.");
  }
  return configured;
}

export function pushEnabled() {
  return ensureConfigured();
}

/** Send to every device the user has enabled. Returns how many accepted it. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);

  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 },
        );
        await db.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
        return true;
      } catch (err) {
        // 404/410: the subscription is gone. The app re-subscribes next time it opens.
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          console.error("[push] send failed", err);
        }
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}

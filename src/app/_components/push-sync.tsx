"use client";

import { useEffect } from "react";

import { api } from "~/trpc/react";

import { currentSubscription, pushSupported, registerServiceWorker } from "./push-client";

/** Registers the service worker and quietly re-subscribes when permission is already granted. */
export function PushSync() {
  const subscribe = api.push.subscribe.useMutation();
  useEffect(() => {
    if (!pushSupported()) return;
    void (async () => {
      await registerServiceWorker();
      const sub = await currentSubscription();
      if (sub) subscribe.mutate(sub);
    })().catch((err) => console.warn("[push] sync failed", err));
  }, []);
  return null;
}

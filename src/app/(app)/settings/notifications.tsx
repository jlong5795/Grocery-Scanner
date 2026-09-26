"use client";

import { useEffect, useState } from "react";

import {
  VAPID_PUBLIC_KEY,
  needsHomeScreenInstall,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "~/app/_components/push-client";
import { relativeDay } from "~/app/_components/format";
import { Button, ErrorNote } from "~/app/_components/ui";
import { api } from "~/trpc/react";

import { Section } from "./section";

export function NotificationsSection() {
  const utils = api.useUtils();
  const status = api.push.status.useQuery();
  const devices = api.push.listMine.useQuery();
  const subscribe = api.push.subscribe.useMutation({ onSuccess: () => utils.push.listMine.invalidate() });
  const unsubscribe = api.push.unsubscribe.useMutation({ onSuccess: () => utils.push.listMine.invalidate() });
  const test = api.push.test.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<{ supported: boolean; installFirst: boolean; permission: string } | null>(null);

  useEffect(() => {
    setEnv({
      supported: pushSupported(),
      installFirst: needsHomeScreenInstall(),
      permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    });
  }, []);

  const enable = async () => {
    setError(null);
    try {
      subscribe.mutate(await subscribeToPush());
      setEnv((e) => (e ? { ...e, permission: "granted" } : e));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    }
  };

  const disable = async () => {
    const endpoint = await unsubscribeFromPush();
    if (endpoint) unsubscribe.mutate({ endpoint });
  };

  return (
    <Section title="Notifications" hint="Used when the shopper asks whether a substitute is OK.">
      {!status.data?.enabled || !VAPID_PUBLIC_KEY ? (
        <p className="text-muted">Push isn&apos;t configured on the server (VAPID keys are missing).</p>
      ) : env?.installFirst ? (
        <p>
          On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there and
          come back here.
        </p>
      ) : !env?.supported ? (
        <p className="text-muted">This browser doesn&apos;t support push notifications.</p>
      ) : (
        <>
          {env.permission === "denied" && (
            <ErrorNote>Notifications are blocked for this site. Allow them in your browser settings.</ErrorNote>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void enable()} disabled={subscribe.isPending}>
              Enable on this device
            </Button>
            <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
              Send a test
            </Button>
          </div>
          {test.data && (
            <p className="text-muted">
              {test.data.delivered > 0
                ? `Sent to ${test.data.delivered} device${test.data.delivered === 1 ? "" : "s"}.`
                : "No devices received it. Enable notifications first."}
            </p>
          )}
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {(devices.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Your devices</p>
          <ul className="flex flex-col gap-1">
            {devices.data!.map((d) => (
              <li key={d.id} className="flex justify-between text-muted">
                <span>{d.userAgent ?? "Device"}</span>
                <span>added {relativeDay(d.createdAt)}</span>
              </li>
            ))}
          </ul>
          <button className="self-start text-sm font-semibold text-danger" onClick={() => void disable()}>
            Turn off on this device
          </button>
        </div>
      )}
    </Section>
  );
}

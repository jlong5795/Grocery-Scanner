"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Camera, type CapturedPhoto } from "~/app/_components/camera";
import { Crop } from "~/app/_components/crop";
import { STORAGE_LABEL } from "~/app/_components/format";
import { Badge, Button, Card, ErrorNote, LinkButton, PageHeader, Spinner } from "~/app/_components/ui";
import { type RouterOutputs, api } from "~/trpc/react";

type Scan = RouterOutputs["scan"]["get"];
type Detection = Scan["detections"][number];

export default function ScanPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const scan = api.scan.get.useQuery(
    { scanId },
    {
      refetchInterval: (q) => (q.state.data?.status === "PROCESSING" ? 2000 : false),
    },
  );

  if (scan.isLoading) return <div className="p-6"><Spinner label="Loading scan…" /></div>;
  if (!scan.data) return <div className="p-6"><ErrorNote>Scan not found.</ErrorNote></div>;

  switch (scan.data.status) {
    case "UPLOADING":
    case "FAILED":
      return <Capture scan={scan.data} />;
    case "PROCESSING":
      return (
        <main className="flex flex-col gap-4 p-6">
          <h1 className="text-2xl font-bold">Looking through your photos</h1>
          <Spinner label={`Identifying items in ${scan.data.photos.length} photos. This can take a minute.`} />
        </main>
      );
    case "REVIEW":
      return <Review scan={scan.data} />;
    case "FINALIZED":
      return (
        <main className="flex flex-col gap-4 p-6">
          <h1 className="text-2xl font-bold">Scan saved</h1>
          <LinkButton href="/">Back home</LinkButton>
        </main>
      );
  }
}

function Capture({ scan }: { scan: Scan }) {
  const utils = api.useUtils();
  const [uploaded, setUploaded] = useState(scan.photos.length);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(scan.error);
  const [cameraOpen, setCameraOpen] = useState(scan.status === "UPLOADING");
  const process = api.scan.process.useMutation({
    onSuccess: () => utils.scan.get.invalidate({ scanId: scan.id }),
    onError: (e) => setError(e.message),
  });

  const upload = async (photo: CapturedPhoto) => {
    setUploading((n) => n + 1);
    try {
      const form = new FormData();
      form.set("photo", photo.blob, "photo.jpg");
      form.set("width", String(photo.width));
      form.set("height", String(photo.height));
      const res = await fetch(`/api/scans/${scan.id}/photos`, { method: "POST", body: form });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Upload failed.");
      setUploaded((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const done = () => {
    setCameraOpen(false);
    process.mutate({ scanId: scan.id });
  };

  if (cameraOpen) {
    return (
      <Camera
        count={uploaded + uploading}
        busy={process.isPending || uploading > 0}
        onCapture={(p) => void upload(p)}
        onDone={done}
      />
    );
  }

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Scan {STORAGE_LABEL[scan.storageType]}</h1>
      {error && <ErrorNote>{error}</ErrorNote>}
      <p className="text-muted">
        {uploaded} {uploaded === 1 ? "photo" : "photos"} uploaded
        {uploading > 0 && `, ${uploading} still uploading`}.
      </p>
      <Button size="lg" onClick={() => setCameraOpen(true)}>
        Take more photos
      </Button>
      <Button
        size="lg"
        variant="secondary"
        disabled={uploaded === 0 || uploading > 0 || process.isPending}
        onClick={done}
      >
        {scan.status === "FAILED" ? "Try again" : "Identify items"}
      </Button>
    </main>
  );
}

type Decision = { action: "confirm" | "reject"; name?: string };

function Review({ scan }: { scan: Scan }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);
  const review = api.scan.review.useMutation();
  const finalize = api.scan.finalize.useMutation();

  const photos = useMemo(() => new Map(scan.photos.map((p) => [p.id, p])), [scan.photos]);
  const flagged = scan.detections.filter((d) => d.status === "PENDING_REVIEW");
  const shown = showAll ? scan.detections : flagged;
  const undecided = flagged.filter((d) => !decisions[d.id]);

  const decide = (id: string, decision: Decision) => setDecisions((all) => ({ ...all, [id]: decision }));

  const save = async () => {
    setError(null);
    try {
      const list = Object.entries(decisions).map(([detectionId, d]) => ({ detectionId, ...d }));
      if (list.length > 0) await review.mutateAsync({ scanId: scan.id, decisions: list });
      const result = await finalize.mutateAsync({ scanId: scan.id });
      router.replace(
        result.notSpotted > 0 ? `/review?type=${scan.storageType}` : `/?saved=${result.seen}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the scan.");
    }
  };

  return (
    <main className="flex flex-col gap-3 pb-28">
      <PageHeader
        title="Check what we found"
        action={
          <button className="text-base font-semibold text-brand" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Flagged only" : `Show all ${scan.detections.length}`}
          </button>
        }
      />
      <p className="px-4 text-muted">
        {scan.detections.length} items found in {STORAGE_LABEL[scan.storageType].toLowerCase()}.{" "}
        {flagged.length > 0
          ? `${flagged.length} need a quick look.`
          : "Everything was identified confidently."}
      </p>

      <ul className="flex flex-col gap-2 px-4">
        {shown.map((d) => (
          <DetectionCard
            key={d.id}
            detection={d}
            photo={photos.get(d.photoId)}
            decision={decisions[d.id]}
            onDecide={(dec) => decide(d.id, dec)}
          />
        ))}
      </ul>

      {scan.detections.length === 0 && (
        <p className="px-4 text-lg">
          Nothing was identified. You can still save, or <Link className="text-brand underline" href="/">start over</Link>.
        </p>
      )}

      <div className="bottom-safe fixed inset-x-0 bottom-16 z-10 mx-auto flex max-w-lg flex-col gap-2 px-4 pb-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {undecided.length > 0 ? (
          <Button
            size="lg"
            variant="secondary"
            className="shadow-lg"
            onClick={() => undecided.forEach((d) => decide(d.id, { action: "confirm" }))}
          >
            {undecided.length === flagged.length
              ? `Confirm all ${undecided.length} remaining`
              : `Confirm the other ${undecided.length}`}
          </Button>
        ) : (
          <Button size="lg" className="shadow-lg" disabled={finalize.isPending || review.isPending} onClick={() => void save()}>
            {finalize.isPending ? "Saving…" : "Save scan"}
          </Button>
        )}
      </div>
    </main>
  );
}

function DetectionCard({
  detection: d,
  photo,
  decision,
  onDecide,
}: {
  detection: Detection;
  photo: Scan["photos"][number] | undefined;
  decision: Decision | undefined;
  onDecide: (d: Decision) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const flagged = d.status === "PENDING_REVIEW";
  const state = decision?.action ?? (flagged ? null : "confirm");
  const box = d.boundingBox as { xMin: number; yMin: number; xMax: number; yMax: number };

  return (
    <li>
      <Card className={`flex flex-col gap-3 ${state === "reject" ? "opacity-50" : ""}`}>
        <div className="flex items-center gap-3">
          {photo && <Crop src={photo.src} photoWidth={photo.width} photoHeight={photo.height} box={box} />}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{decision?.name ?? d.name}</p>
            <p className="text-sm text-muted">
              {d.matchedItem ? "Already in your catalog" : "New item"} · {Math.round(d.confidence * 100)}% sure
            </p>
          </div>
          {flagged && !decision && <Badge tone="warn">Check</Badge>}
        </div>

        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onDecide({ action: "confirm", name: name.trim() || d.name });
              setEditing(false);
            }}
          >
            <input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              aria-label="Correct name"
              className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-lg"
            />
            <Button type="submit">Save</Button>
          </form>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={state === "confirm" ? "primary" : "secondary"}
              onClick={() => onDecide({ action: "confirm", name: decision?.name })}
            >
              Yes
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Rename
            </Button>
            <Button
              variant={state === "reject" ? "danger" : "secondary"}
              onClick={() => onDecide({ action: "reject" })}
            >
              Not it
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

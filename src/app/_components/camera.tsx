"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "./ui";

/**
 * Full-bleed camera for burst capture (spec section 11). Falls back to the
 * system camera/file picker where getUserMedia isn't available. Every photo is
 * downscaled to at most MAX_EDGE px and JPEG-compressed before upload.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export interface CapturedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

function scaledSize(w: number, h: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<CapturedPhoto> {
  const { width, height } = scaledSize(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo."))), "image/jpeg", QUALITY),
  );
  return { blob, width, height };
}

export function Camera({
  count,
  onCapture,
  onDone,
  busy,
}: {
  count: number;
  onCapture: (photo: CapturedPhoto) => void;
  onDone: () => void;
  busy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setLive(true);
        }
      })
      .catch(() => setLive(false));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shoot = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    onCapture(await toJpeg(video, video.videoWidth, video.videoHeight));
  };

  const pickFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const bitmap = await createImageBitmap(file);
      onCapture(await toJpeg(bitmap, bitmap.width, bitmap.height));
      bitmap.close();
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg">Camera preview isn&apos;t available here.</p>
            <Button onClick={() => fileRef.current?.click()}>Take or choose photos</Button>
          </div>
        )}
        <p className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1 text-base font-semibold">
          {count} {count === 1 ? "photo" : "photos"}
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void pickFiles(e.target.files)}
      />
      <div className="bottom-safe grid grid-cols-3 items-center gap-2 bg-black px-4 py-4">
        <button className="justify-self-start text-base font-semibold" onClick={() => fileRef.current?.click()}>
          Library
        </button>
        <button
          aria-label="Take photo"
          disabled={!live}
          onClick={() => void shoot()}
          className="h-20 w-20 justify-self-center rounded-full border-4 border-white bg-white/20 active:bg-white/60 disabled:opacity-30"
        />
        <button
          disabled={count === 0 || busy}
          onClick={onDone}
          className="justify-self-end rounded-2xl bg-brand px-5 py-3 text-lg font-semibold disabled:opacity-40"
        >
          Done
        </button>
      </div>
    </div>
  );
}

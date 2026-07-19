"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { attachMedia, getSignedUploadUrl, removeMedia } from "@/actions/media";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

export interface MediaItem {
  path: string;
  url: string; // signed
}

/** Upload flow: signed URL from the server, browser PUTs the file, then the path is attached. */
export function MediaManager({
  productId,
  images,
  video,
}: {
  productId: string;
  images: MediaItem[];
  video: { path: string } | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File, kind: "image" | "video") => {
    setBusy(true);
    setResult(null);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const ticket = await getSignedUploadUrl(productId, kind, ext);
      if (!ticket.ok) {
        setResult(ticket);
        return;
      }
      const put = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        setResult({ ok: false, error: "Upload failed — try again." });
        return;
      }
      setResult(await attachMedia(productId, kind, ticket.path));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  const remove = (kind: "image" | "video", path: string) => {
    startTransition(async () => {
      setResult(await removeMedia(productId, kind, path));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {images.map((img) => (
          <div key={img.path} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs expire */}
            <img src={img.url} alt="Product photo" className="absolute inset-0 size-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => remove("image", img.path)}
              className="pressable cursor-pointer absolute top-1 right-1 rounded-full bg-black/60 text-white p-1.5"
            >
              <X className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ))}
        {images.length < 5 ? (
          <button
            type="button"
            onClick={() => imgInput.current?.click()}
            disabled={busy}
            className="pressable cursor-pointer aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-subtle text-xs font-semibold disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <ImagePlus className="size-5" strokeWidth={2} aria-hidden />
            )}
            Add photo
          </button>
        ) : null}
      </div>
      <p className="text-xs text-subtle">Up to 5 photos. The AI shows these to customers.</p>

      <div className="flex items-center gap-2">
        {video ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-subtle px-3 py-1.5 text-xs font-semibold">
              <Video className="size-3.5" strokeWidth={2} aria-hidden /> Video attached
            </span>
            <button
              type="button"
              onClick={() => remove("video", video.path)}
              className="pressable cursor-pointer text-xs font-semibold text-destructive-text min-h-11 px-2"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => vidInput.current?.click()}
            disabled={busy}
            className="pressable cursor-pointer inline-flex items-center gap-2 rounded-xl border border-border text-sm font-semibold px-3.5 py-2.5 min-h-11 disabled:opacity-60"
          >
            <Video className="size-4" strokeWidth={2} aria-hidden />
            Add one video
          </button>
        )}
      </div>

      <Feedback result={result} />

      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, "image");
          e.target.value = "";
        }}
      />
      <input
        ref={vidInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, "video");
          e.target.value = "";
        }}
      />
    </div>
  );
}

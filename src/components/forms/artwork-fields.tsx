"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, X } from "lucide-react";
import type { ArtworkKind } from "@/lib/blob-artwork";

const ARTWORK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareArtwork(file: File): Promise<File> {
  if (!ARTWORK_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new window.Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("This image could not be opened."));
      candidate.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image has no usable dimensions.");

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    // Letterboxing should match the paper the artwork sits on, which differs per
    // skin, so read it from the active theme instead of hard-coding one palette.
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
    context.fillStyle = paper || "#f4f0e6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("This browser could not prepare the image.");
    if (blob.size > 2 * 1024 * 1024) throw new Error("This image is still too large after optimization. Try a simpler image.");
    return new File([blob], "artwork.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function uploadArtwork(
  kind: ArtworkKind,
  ownerId: string,
  file: File,
  onProgress?: (percentage: number) => void,
) {
  return upload(`artwork/${kind}/${encodeURIComponent(ownerId)}/${Date.now()}.jpg`, file, {
    access: "public",
    contentType: "image/jpeg",
    handleUploadUrl: "/api/artwork/upload",
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });
}

export async function discardUploadedArtwork(urls: string[]) {
  if (!urls.length) return;
  try {
    await fetch("/api/artwork/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
  } catch {}
}

export function ArtworkPicker({
  id,
  label,
  initials,
  existingUrl,
  onChange,
  onBusyChange,
}: {
  id: string;
  label: string;
  initials: string;
  existingUrl?: string;
  onChange(value: File | null): void;
  onBusyChange(busy: boolean): void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    onBusyChange(true);
    setError(undefined);
    try {
      const prepared = await prepareArtwork(file);
      setPreviewUrl(URL.createObjectURL(prepared));
      setRemoved(false);
      setFileName(file.name);
      onChange(prepared);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "This image could not be prepared.");
    } finally {
      onBusyChange(false);
    }
  }

  function remove() {
    setPreviewUrl(undefined);
    setRemoved(true);
    setFileName(undefined);
    setError(undefined);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const imageUrl = previewUrl ?? (removed ? undefined : existingUrl);

  return <div className="field field-full">
    <label htmlFor={id}>{label} <span className="optional-label">Optional</span></label>
    <div className="artwork-picker">
      <div className={`artwork-preview${imageUrl ? " artwork-preview-image" : ""}`}>
        {imageUrl ? <Image src={imageUrl} alt={`Selected ${label.toLowerCase()}`} fill sizes="112px" unoptimized /> : <><span>{initials}</span><i /></>}
      </div>
      <div className="artwork-picker-copy">
        <input ref={inputRef} id={id} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={select} />
        <div className="artwork-picker-actions"><label htmlFor={id} className="button button-ghost button-small"><ImagePlus size={15} /> {imageUrl ? "Replace image" : "Add image"}</label>{imageUrl && <button type="button" className="button button-ghost button-small" onClick={remove}><X size={15} /> Remove</button>}</div>
        <p>{error ?? fileName ?? "JPEG, PNG, or WebP up to 10 MB. Images are cropped square."}</p>
      </div>
    </div>
  </div>;
}

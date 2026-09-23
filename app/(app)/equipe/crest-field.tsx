"use client";

import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  CREST_KEEP,
  CREST_MAX_SIDE,
  CREST_REMOVE,
  crestFits,
  fitWithin,
} from "@/lib/team/crest";

/**
 * Choosing the club crest, resized in the browser before it is ever sent.
 *
 * The app has no object store (decision 054), so what the Server Action receives is not a file but a
 * `data:` URL of at most {@link CREST_MAX_SIDE} pixels a side, re-encoded here from whatever the phone
 * offered. Doing the work on this side has three consequences worth having: a 4 MB photograph from an
 * iPhone never crosses the wire, the coach sees exactly the image that will be stored before he saves,
 * and the only thing the server has to trust is a string it can validate with a regular expression.
 *
 * The preview is the honest one: it is the re-encoded result, not the original file, so an image that
 * came out badly is visible **before** « Enregistrer » rather than in the header afterwards.
 */
export function CrestField({
  name,
  crestUrl,
  primaryColor,
}: {
  /** The team's name — the fallback disc, and the alt text of nothing (the crest is decorative). */
  name: string;
  crestUrl: string | null;
  primaryColor: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** What the form will post: `""` keep, `"none"` remove, or a data URL. */
  const [value, setValue] = useState<string>(CREST_KEEP);
  const [preview, setPreview] = useState<string | null>(crestUrl);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setWorking(true);
    try {
      const dataUrl = await reencodeCrest(file);
      setValue(dataUrl);
      setPreview(dataUrl);
    } catch (cause) {
      setError(
        cause instanceof CrestError
          ? cause.message
          : "Cette image n’a pas pu être lue. Essaie un PNG ou un JPEG.",
      );
      // Leave the field as it was: a failed pick must not silently remove the crest.
      setValue(CREST_KEEP);
      setPreview(crestUrl);
    } finally {
      setWorking(false);
      // Let the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-ink">Blason</span>

      <input type="hidden" name="crest" value={value} />

      <div className="flex items-center gap-3">
        {preview !== null ? (
          // A data URL, so `next/image` has nothing to optimise and no domain to allow.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-xl border border-border bg-surface object-contain p-0.5"
          />
        ) : (
          <Avatar name={name} color={primaryColor} />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => inputRef.current?.click()}
          >
            {working ? "Préparation…" : preview !== null ? "Changer" : "Choisir une image"}
          </Button>

          {preview !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={working}
              onClick={() => {
                setValue(CREST_REMOVE);
                setPreview(null);
                setError(null);
              }}
            >
              Retirer
            </Button>
          ) : null}
        </div>
      </div>

      {/* Hidden rather than styled: a bare file input cannot be made to look like the rest of the
          form on every mobile browser, and the two buttons above drive it. `sr-only` keeps it
          reachable by a screen reader and by the keyboard. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Fichier du blason"
        className="sr-only"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />

      <p className="text-xs text-ink-subtle">
        {value === CREST_REMOVE
          ? "Le blason sera retiré à l’enregistrement : l’équipe reprendra son disque de couleur."
          : `L’image est réduite à ${CREST_MAX_SIDE} px et stockée avec l’équipe. Un PNG transparent rend le mieux.`}
      </p>

      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A message meant for the coach, as opposed to a decoding failure nobody can act on. */
class CrestError extends Error {}

/**
 * Whatever the phone offered → a small PNG `data:` URL.
 *
 * PNG first, because a crest is flat colour on transparency and that is what PNG is for. A
 * photograph of a jersey does not compress that way, so if the result is over the ceiling it is
 * re-encoded as a JPEG **on white** — the transparency is gone either way, and a white square beats
 * the black one an unfilled canvas would produce.
 */
async function reencodeCrest(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  if (width === 0 || height === 0) throw new CrestError("Cette image est vide.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new CrestError("Le navigateur n’a pas pu redimensionner l’image.");
  context.drawImage(bitmap, 0, 0, width, height);

  const png = canvas.toDataURL("image/png");
  if (crestFits(png)) return png;

  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  if (crestFits(jpeg)) return jpeg;

  throw new CrestError("Ce blason est trop lourd : choisis une image plus simple.");
}

/**
 * `createImageBitmap` where it exists, an `<img>` everywhere else.
 *
 * Safari on older iOS is the reason for the fallback, and a phone two years behind is exactly the
 * device this app is used on.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through: a format the bitmap decoder refuses may still load in an <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new CrestError("Cette image n’a pas pu être lue."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

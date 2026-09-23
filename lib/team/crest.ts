/**
 * The club crest: how big it may be, and how an arbitrary photograph is made to fit.
 *
 * `teams.crest_url` has existed since the first migration, the app header has read it since M0, and
 * until now **nothing wrote it** — the column was a promise the UI kept and the app never let anybody
 * make. The reason it stayed empty is that uploading a file needs somewhere to put it, and this app
 * has no object store: see decision 054 for why the crest is re-encoded in the browser and stored in
 * the row as a `data:` URL instead.
 *
 * That choice is what makes the numbers here matter. `lib/auth/dal.ts` loads the team on every
 * authenticated request, so the crest is read on every page load: a ceiling of ~24 KB of image is a
 * deliberate trade of fidelity for a column that can be selected without thinking about it. At the
 * 32 CSS pixels the header draws it at, 96 physical pixels still covers a 3× phone screen.
 *
 * Pure and isomorphic on purpose — the browser resizes with it, the Server Action validates against
 * it, and the fit is arithmetic a test can check without a canvas.
 */

/** Longest side of the stored image, in pixels. 3× the 32 px the header draws. */
export const CREST_MAX_SIDE = 96;

/**
 * Ceiling on the stored `data:` URL, in characters.
 *
 * Base64 costs a third on top of the bytes, so 32 000 characters is about 24 KB of image — a 96 px
 * crest with flat colours lands around 5 KB, a 96 px photograph around 15 KB, and something pathological
 * is refused with a sentence telling the coach to choose a simpler image rather than silently stored.
 */
export const CREST_MAX_CHARS = 32_000;

/** What the stored value must look like. The browser re-encodes, so only these two ever arrive. */
export const CREST_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * The box `width × height` becomes when it is scaled to fit inside `max × max`.
 *
 * **Contain, never crop**: a crest is a badge with a shape, and cutting a wolf's ears off to make a
 * square is worse than a small wolf. An image already inside the box is left alone rather than blown
 * up — enlarging 40 px of artwork to 96 px only stores the blur.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number = CREST_MAX_SIDE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when a re-encoded crest is small enough to live in the row. */
export function crestFits(dataUrl: string): boolean {
  return dataUrl.length <= CREST_MAX_CHARS;
}

/**
 * The three things the form can say about the crest, as one field.
 *
 * `""` means the coach did not touch it — a form that rewrote the crest every time the team was
 * renamed would lose it the day the image failed to re-encode. `"none"` is the explicit « Retirer ».
 */
export const CREST_KEEP = "";
export const CREST_REMOVE = "none";

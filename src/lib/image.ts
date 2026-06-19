/** Downscale an image File to a JPEG data URL with a max dimension. */
export async function downscale(
  file: File,
  maxDim: number,
  quality = 0.82,
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const { width, height, draw } = await loadDrawable(file);
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  draw(ctx, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = dataUrl.split(",")[1] ?? "";
  return { dataUrl, base64, mimeType: "image/jpeg" };
}

type Drawable = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
};

/**
 * Decode an image file into something we can draw to a canvas. Prefers
 * createImageBitmap (fast, applies EXIF orientation) but falls back to an
 * <img> element when the browser can't decode the file that way (e.g. some
 * HEIC photos from iPhones).
 */
async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
      };
    } catch {
      // fall through to the <img> path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Couldn't read that image. Try a JPG or PNG photo."));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } finally {
    // Revoke after the current task so draw() can still use the element.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

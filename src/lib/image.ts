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

function bitmapDrawable(bitmap: ImageBitmap): Drawable {
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw: (ctx, w, h) => {
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
    },
  };
}

/** Load an <img> from a src string, resolving once it has real dimensions. */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => {
      if (el.naturalWidth > 0 && el.naturalHeight > 0) resolve(el);
      else reject(new Error("empty image"));
    };
    el.onerror = () => reject(new Error("decode failed"));
    el.src = src;
  });
}

/** Read a File as a base64 data URL (a robust last-resort for iOS HEIC/odd types). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Decode an image file into something we can draw to a canvas. Several browsers
 * (notably iOS Safari) are picky: some reject the createImageBitmap options
 * argument, some can't decode HEIC via object URLs. We try the fast paths first
 * and progressively fall back so a valid photo essentially always loads.
 */
async function loadDrawable(file: File): Promise<Drawable> {
  // 1) createImageBitmap with EXIF orientation (fastest, best quality).
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width > 0 && bitmap.height > 0) return bitmapDrawable(bitmap);
    } catch {
      /* some iOS versions reject the options dict — try without it */
    }
    // 2) createImageBitmap with no options.
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) return bitmapDrawable(bitmap);
    } catch {
      /* fall through to <img> */
    }
  }

  // 3) <img> from an object URL.
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await loadImg(objectUrl);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } catch {
    /* fall through to data URL */
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 10_000);
  }

  // 4) <img> from a FileReader data URL (most compatible).
  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImg(dataUrl);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } catch {
    throw new Error(
      "Couldn't read that photo. Try taking a new one, or pick a JPG/PNG.",
    );
  }
}

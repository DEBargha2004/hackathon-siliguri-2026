/**
 * Utility to convert an ImageBitmap directly to a compressed JPEG Blob
 * without re-capturing or high-res duplication.
 */
export async function imageBitmapToBlob(
  bitmap: ImageBitmap,
  quality = 0.85
): Promise<Blob> {
  // Use OffscreenCanvas if available in the execution environment
  if (typeof OffscreenCanvas !== "undefined") {
    const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = offscreen.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      return offscreen.convertToBlob({
        type: "image/jpeg",
        quality,
      });
    }
  }

  // Fallback to DOM canvas
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas toBlob conversion failed"));
          },
          "image/jpeg",
          quality
        );
      });
    }
  }

  throw new Error("Unable to convert ImageBitmap to Blob: Canvas context unavailable");
}

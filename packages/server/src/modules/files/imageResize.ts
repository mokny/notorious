import sharp from "sharp";

export interface ImageResizeLimits {
  maxWidth: number | null;
  maxHeight: number | null;
  quality: number;
}

export interface ResizedImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Downscales+re-encodes an uploaded image to WebP if it exceeds the
 * workspace's configured max width/height (see workspaces.imageMaxWidth/
 * Height and coverMaxWidth/Height in db/schema.ts) - returns null (leave the
 * upload untouched) whenever no resize is actually needed: no limit
 * configured, the image already fits, it's not a raster image at all (SVG),
 * or it's an animated image (GIF/animated WebP/APNG) - animated re-encoding
 * via sharp is a lot more fragile than a still frame, and not worth the risk
 * for what's meant to be a storage-saving convenience feature.
 */
export async function maybeResizeImage(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  limits: ImageResizeLimits,
): Promise<ResizedImage | null> {
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") return null;
  if (limits.maxWidth == null && limits.maxHeight == null) return null;

  const image = sharp(buffer, { animated: true });
  const metadata = await image.metadata();
  if ((metadata.pages ?? 1) > 1) return null;

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const exceedsWidth = limits.maxWidth != null && width > limits.maxWidth;
  const exceedsHeight = limits.maxHeight != null && height > limits.maxHeight;
  if (!exceedsWidth && !exceedsHeight) return null;

  const resizedBuffer = await sharp(buffer)
    .resize({ width: limits.maxWidth ?? undefined, height: limits.maxHeight ?? undefined, fit: "inside", withoutEnlargement: true })
    .webp({ quality: limits.quality })
    .toBuffer();

  const newFilename = `${filename.replace(/\.[^./]+$/, "")}.webp`;
  return { buffer: resizedBuffer, mimeType: "image/webp", filename: newFilename };
}

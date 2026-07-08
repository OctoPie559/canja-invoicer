import { ValidationError } from "@/lib/domain/errors";

/**
 * Shared validation for user-uploaded raster images (branding logos,
 * contact photos, product images). Objects land on a PUBLIC bucket, so the
 * bytes are verified against the declared type — the client's content type
 * is never trusted on its own.
 */

export const IMAGE_MAX_BYTES = 512 * 1024;
export const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export function assertImageUpload(
  bytes: Uint8Array,
  contentType: string,
): asserts contentType is ImageContentType {
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new ValidationError("Image must be a PNG or JPEG");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ValidationError("Image must be between 1 byte and 512 KB");
  }
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg =
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  if (
    (contentType === "image/png" && !isPng) ||
    (contentType === "image/jpeg" && !isJpeg)
  ) {
    throw new ValidationError("File content does not match the image type");
  }
}

export function imageExtension(contentType: ImageContentType): string {
  return contentType === "image/png" ? "png" : "jpg";
}

/**
 * Client-side pre-check for upload dialogs: returns a human message or
 * null. Mirrors the server rules so oversized files never leave the
 * browser (the Server Action transport would reject big bodies with an
 * opaque error before our server validation could answer).
 */
export function validateImageFile(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose an image file";
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Image must be a PNG or JPEG";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    const kb = Math.round(file.size / 1024);
    return `Image is ${kb} KB — the limit is 512 KB. Please resize it.`;
  }
  return null;
}

import { getStorage } from "firebase-admin/storage";
import { randomBytes } from "node:crypto";
import { admin } from "./firebase-admin.js";

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

export function assertAllowedImageMime(mime: string): asserts mime is "image/jpeg" | "image/png" | "image/webp" {
  if (!ALLOWED_IMAGE.has(mime)) {
    throw new StorageUploadError("Only JPEG, PNG, or WebP images are allowed.", "INVALID_IMAGE_TYPE");
  }
}

export class StorageUploadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "StorageUploadError";
  }
}

/**
 * Upload bytes to the default bucket and return a stable Firebase download URL (token metadata).
 */
export async function uploadPublicDownloadUrl(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  assertAllowedImageMime(contentType);
  const bucket = getStorage(admin.app()).bucket();
  const token = randomBytes(16).toString("hex");
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

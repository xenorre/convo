// Mirrors the server: the schema default and older placeholders are not uploads.
export const isDefaultAvatar = (url: string | undefined) =>
  !url || url.includes("wikimedia.org") || url.includes("placeholder");

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/utils/uploads";

// Same limits the server enforces for profile photos.
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > MAX_UPLOAD_BYTES) return `The photo must be ${MAX_UPLOAD_LABEL} or smaller.`;
  return null;
}

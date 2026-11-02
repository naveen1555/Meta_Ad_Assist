import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { randomToken } from "./utils";

export const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

export function extensionFor(mime: string | undefined, fallbackName?: string) {
  const base = mime?.split(";")[0]?.trim() ?? "";
  if (EXT_BY_MIME[base]) return EXT_BY_MIME[base];
  const fromName = fallbackName?.split(".").pop();
  return fromName && fromName.length <= 5 ? fromName : "bin";
}

/** Saves a file to the upload directory (a Railway volume in production) and returns its public URL. */
export async function saveBuffer(buffer: Buffer, mime?: string, originalName?: string) {
  const file = `${Date.now()}-${randomToken(8)}.${extensionFor(mime, originalName)}`;
  await fs.promises.writeFile(path.join(uploadDir, file), buffer);
  return publicUrl(file);
}

export function publicUrl(file: string) {
  return `${config.apiUrl}/media/${file}`;
}

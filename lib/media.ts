import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/types";

export const BUCKET = "chat-media";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function formatDuration(sec?: number | null) {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Короткая подпись сообщения для списка чатов. */
export function previewOf(m: Pick<Message, "kind" | "body" | "media_name">) {
  if (m.kind === "image") return "Фото";
  if (m.kind === "voice") return "Голосовое сообщение";
  if (m.kind === "file") return `Файл: ${m.media_name ?? ""}`;
  return m.body;
}

function extOf(name: string, mime: string) {
  const fromName = name.includes(".") ? name.split(".").pop() : "";
  const clean = (fromName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  if (clean) return clean;
  return mime.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/g, "") || "bin";
}

/** Уменьшает фото до 1600 px по длинной стороне и сжимает в JPEG. GIF и ошибки декодирования: отправляем как есть. */
export async function compressImage(file: File): Promise<{ blob: Blob; mime: string; name: string }> {
  const original = { blob: file as Blob, mime: file.type || "image/jpeg", name: file.name || "photo.jpg" };
  if (file.type === "image/gif" || file.type === "image/svg+xml") return original;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return original;
    g.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return original;
    return { blob, mime: "image/jpeg", name: original.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return original;
  }
}

/** Загружает файл в приватное хранилище, папка = id чата. Возвращает путь. */
export async function uploadChatMedia(chatId: string, blob: Blob, name: string, mime: string): Promise<string> {
  const path = `${chatId}/${crypto.randomUUID()}.${extOf(name, mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

const urlCache = new Map<string, { url: string; exp: number }>();

export async function getSignedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
  return data.signedUrl;
}

export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return;
    let active = true;
    setFailed(false);
    getSignedUrl(path).then((u) => {
      if (!active) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return { url, failed };
}

/** Формат записи, который поддерживает устройство (Android: webm/opus, Safari: mp4). */
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

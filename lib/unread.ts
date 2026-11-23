import { useSyncExternalStore } from "react";

// Счётчики непрочитанных сообщений по чатам. Хранятся на устройстве, чтобы пережить перезапуск.
const KEY = "tosto:unread";
const EMPTY: Record<string, number> = {};
const subs = new Set<() => void>();

function load(): Record<string, number> {
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let counts: Record<string, number> = load();

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(counts));
  } catch {
    // хранилище недоступно, счётчики живут до перезапуска
  }
  subs.forEach((fn) => fn());
}

export function addUnread(chatId: string) {
  counts = { ...counts, [chatId]: (counts[chatId] ?? 0) + 1 };
  emit();
}

export function clearUnread(chatId: string) {
  if (!counts[chatId]) return;
  const { [chatId]: _removed, ...rest } = counts;
  counts = rest;
  emit();
}

export function useUnreadCounts() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => counts,
    () => EMPTY,
  );
}

export function useUnreadTotal() {
  const c = useUnreadCounts();
  let total = 0;
  for (const k in c) total += c[k];
  return total;
}

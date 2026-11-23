import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

type Entry = { priority: number; id: number; fn: () => void };
const stack: Entry[] = [];
let seq = 0;

/**
 * Регистрирует действие для кнопки «назад» на Android, пока active = true.
 * Срабатывает обработчик с наибольшим приоритетом (окна > страница профиля > открытый чат > вкладка).
 */
export function useBackHandler(active: boolean, fn: () => void, priority = 10) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { priority, id: ++seq, fn: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active, priority]);
}

function handleBack(): boolean {
  if (!stack.length) return false;
  const top = [...stack].sort((a, b) => b.priority - a.priority || b.id - a.id)[0];
  top.fn();
  return true;
}

/** Подключает системную кнопку «назад»: если закрывать нечего, приложение сворачивается, а не закрывается. */
export function installBackButton(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => Promise<void> } | undefined;
  let removed = false;
  void App.addListener("backButton", () => {
    if (!handleBack()) void App.minimizeApp();
  }).then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}

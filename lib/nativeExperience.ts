import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/** Подстраивает WebView под реальную высоту окна и клавиатуру Android. */
export function installNativeExperience(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let disposed = false;
  let appStateHandle: { remove: () => Promise<void> } | undefined;

  const syncViewport = () => {
    if (disposed) return;
    const height = Math.round(viewport?.height ?? window.innerHeight);
    root.style.setProperty("--tosto-viewport-height", `${height}px`);

    const active = document.activeElement;
    const isEditable = active instanceof HTMLElement &&
      (active.matches("input, textarea, select") || active.isContentEditable);
    const keyboardVisible = Boolean(isEditable && window.innerHeight - height > 120);
    root.dataset.keyboardOpen = keyboardVisible ? "true" : "false";
  };

  const onFocus = () => window.setTimeout(syncViewport, 80);
  const onBlur = () => window.setTimeout(syncViewport, 180);
  viewport?.addEventListener("resize", syncViewport);
  viewport?.addEventListener("scroll", syncViewport);
  window.addEventListener("resize", syncViewport);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  syncViewport();

  void App.addListener("appStateChange", ({ isActive }) => {
    root.dataset.appState = isActive ? "active" : "background";
    window.dispatchEvent(new CustomEvent(isActive ? "tosto:resume" : "tosto:pause"));
    if (isActive) window.setTimeout(syncViewport, 100);
  }).then((handle) => {
    if (disposed) void handle.remove();
    else appStateHandle = handle;
  });

  return () => {
    disposed = true;
    viewport?.removeEventListener("resize", syncViewport);
    viewport?.removeEventListener("scroll", syncViewport);
    window.removeEventListener("resize", syncViewport);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    void appStateHandle?.remove();
    root.style.removeProperty("--tosto-viewport-height");
    delete root.dataset.keyboardOpen;
    delete root.dataset.appState;
  };
}

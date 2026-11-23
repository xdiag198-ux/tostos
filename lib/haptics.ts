import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/** Лёгкая вибро-отдача на нажатие. Работает только в приложении, в браузере молчит. */
export function haptic(kind: "light" | "medium" = "light") {
  if (!Capacitor.isNativePlatform()) return;
  try {
    void Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
  } catch {
    // не критично
  }
}

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

let currentToken: string | null = null;

/** Просит разрешение, получает токен устройства и сохраняет его в Supabase. Работает только в Android-приложении. */
export async function registerPush(onOpen?: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  // Без google-services.json Firebase в приложении не инициализирован, и PushNotifications.register()
  // роняет приложение. Поэтому пуши включаются только в сборке, где этот файл есть (см. workflow).
  if (import.meta.env.VITE_PUSH_ENABLED !== "true") return () => {};

  const handles: { remove: () => Promise<void> }[] = [];
  try {
    handles.push(
      await PushNotifications.addListener("registration", async (t) => {
        currentToken = t.value;
        const { error } = await supabase.rpc("register_device_token", {
          p_token: t.value,
          p_platform: Capacitor.getPlatform(),
        });
        if (error) console.error("[push] не удалось сохранить токен", error.message);
      }),
      await PushNotifications.addListener("registrationError", (e) => {
        console.error("[push] ошибка регистрации", e.error);
      }),
      await PushNotifications.addListener("pushNotificationActionPerformed", () => {
        onOpen?.();
      }),
    );

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive === "granted") await PushNotifications.register();
  } catch (e) {
    console.error("[push] недоступно", e);
  }

  return () => {
    handles.forEach((h) => void h.remove());
  };
}

/** При выходе из аккаунта отвязывает это устройство, чтобы чужие сообщения не приходили. */
export async function unregisterPush() {
  if (!currentToken) return;
  try {
    await supabase.rpc("unregister_device_token", { p_token: currentToken });
  } catch {
    // не критично
  }
  currentToken = null;
}

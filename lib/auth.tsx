import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { unregisterPush } from "@/lib/push";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Текст ошибки, если профиль не удалось загрузить или создать (вместо вечной загрузки). */
  profileError: string | null;
  /** Ошибка входа, которую Supabase вернул в адресной строке (например, «Database error saving new user»). */
  authError: string | null;
  /** Не заданы ключи Supabase (.env). */
  configError: string | null;
  retryProfile: () => void;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Ссылка, на которую Supabase возвращает пользователя после входа в приложении (Android).
// Должна быть добавлена в Supabase → Authentication → URL Configuration → Redirect URLs
// и прописана в AndroidManifest.xml (это делает scripts/patch-android.mjs).
export const NATIVE_REDIRECT = "com.tosto.app://auth-callback";

export const isNativeApp = () => Capacitor.isNativePlatform();

const PROFILE_COLS_FULL =
  "id, display_name, handle, avatar_url, bio, banner_url, track_url, track_title, track_artist";
const PROFILE_COLS_MIN = "id, display_name, handle, avatar_url";

/** Проверяем, что ключи Supabase вообще заданы: без них клиент падает при первом обращении. */
function readConfigError(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env["VITE_SUPABASE_URL"];
  const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (url && key) return null;
  return "Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY. Создайте файл .env по образцу .env.example и перезапустите сборку.";
}

/** Ошибка входа из адресной строки: Supabase кладёт её в ?error_description=... или #error_description=... */
function readUrlAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const msg =
    params.get("error_description") ?? hash.get("error_description") ?? params.get("error") ?? hash.get("error");
  if (!msg) return null;
  try {
    // чистим адрес, чтобы ошибка не показывалась после обновления страницы
    const clean = new URL(window.location.href);
    ["error", "error_code", "error_description"].forEach((k) => clean.searchParams.delete(k));
    clean.hash = "";
    window.history.replaceState(null, "", clean.pathname + clean.search);
  } catch {
    // не критично
  }
  return msg.replace(/\+/g, " ");
}

function humanizeAuthError(msg: string): string {
  if (/database error saving new user/i.test(msg)) {
    return "Не удалось создать профиль в базе данных. Выполните supabase/fix_registration_and_banner.sql в Supabase → SQL Editor и попробуйте снова.";
  }
  if (/redirect/i.test(msg) && /(url|uri)/i.test(msg)) {
    return "Адрес приложения не добавлен в Supabase → Authentication → URL Configuration → Redirect URLs.";
  }
  return msg;
}

// Разбирает ссылку возврата и завершает вход. Поддерживает оба варианта Supabase:
// ?code=... (PKCE) и #access_token=...&refresh_token=... (implicit).
async function completeNativeSignIn(url: string): Promise<void> {
  if (!url.startsWith(NATIVE_REDIRECT)) return;
  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");
  const query =
    queryIdx >= 0 ? url.slice(queryIdx + 1, hashIdx > queryIdx ? hashIdx : undefined) : "";
  const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
  const q = new URLSearchParams(query);
  const h = new URLSearchParams(hash);

  try {
    const code = q.get("code");
    const accessToken = h.get("access_token") ?? q.get("access_token");
    const refreshToken = h.get("refresh_token") ?? q.get("refresh_token");
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    } else if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    } else {
      console.error("[auth] В ссылке возврата нет ни code, ни токенов:", q.get("error_description") ?? "");
    }
  } catch (e) {
    console.error("[auth] Не удалось завершить вход", e);
  } finally {
    try {
      await Browser.close();
    } catch {
      // на Android метод может быть недоступен, окно закрывается само
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileTry, setProfileTry] = useState(0);
  const configError = useMemo(() => readConfigError(), []);

  useEffect(() => {
    const urlError = readUrlAuthError();
    if (urlError) setAuthError(humanizeAuthError(urlError));
  }, []);

  useEffect(() => {
    if (configError) {
      setLoading(false);
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          setSession(data.session);
          setLoading(false);
        })
        .catch((e) => {
          console.error("[auth] getSession", e);
          if (active) setLoading(false);
        });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setLoading(false);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    } catch (e) {
      console.error("[auth] init", e);
      setLoading(false);
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [configError]);

  // Приложение на Android: ловим возврат из браузера после входа через Google.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const handle = CapApp.addListener("appUrlOpen", (event) => {
      void completeNativeSignIn(event.url);
    });
    CapApp.getLaunchUrl().then((launch) => {
      if (!cancelled && launch?.url) void completeNativeSignIn(launch.url);
    });
    return () => {
      cancelled = true;
      void handle.then((h) => h.remove());
    };
  }, []);

  const userId = session?.user.id ?? null;

  // Загружает профиль. Если полный запрос падает (в базе нет новых колонок) пробуем минимальный;
  // если профиля нет вовсе (триггер регистрации сломался), создаём его сами.
  const loadProfile = useCallback(async (id: string, authUser: User | null): Promise<{ profile: Profile | null; error: string | null }> => {
    let res = await supabase.from("profiles").select(PROFILE_COLS_FULL).eq("id", id).maybeSingle();
    if (res.error) {
      console.error("[auth] profiles (full)", res.error);
      res = (await supabase.from("profiles").select(PROFILE_COLS_MIN).eq("id", id).maybeSingle()) as typeof res;
    }
    if (res.error) {
      return {
        profile: null,
        error: `Не удалось прочитать таблицу profiles: ${res.error.message}. Выполните supabase/tosto_schema.sql и supabase/fix_registration_and_banner.sql.`,
      };
    }
    if (res.data) return { profile: res.data as unknown as Profile, error: null };

    // Профиля нет: создаём собственный.
    const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
    const email = authUser?.email ?? "";
    const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 12) ?? "";
    const base = local.length >= 3 ? local : "user";
    const handle = `${base}_${Math.random().toString(36).slice(2, 6)}`;
    const name = String(meta.full_name ?? meta.name ?? (email.split("@")[0] || "Пользователь")).trim().slice(0, 40) || "Пользователь";
    const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;
    const ins = await supabase
      .from("profiles")
      .insert({ id, display_name: name, handle, avatar_url: avatar })
      .select(PROFILE_COLS_MIN)
      .maybeSingle();
    if (ins.error) {
      return {
        profile: null,
        error: `Профиль не создан: ${ins.error.message}. Выполните supabase/fix_registration_and_banner.sql в Supabase → SQL Editor.`,
      };
    }
    return { profile: (ins.data as unknown as Profile | null) ?? null, error: null };
  }, []);

  // Профиль грузим отдельным эффектом, не внутри onAuthStateChange (иначе возможен дедлок клиента).
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    let active = true;
    setProfileError(null);
    loadProfile(userId, session?.user ?? null).then((r) => {
      if (!active) return;
      setProfile(r.profile);
      setProfileError(r.error);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadProfile, profileTry]);

  // Перечитать профиль после редактирования (имя, юзернейм, аватар обновятся везде).
  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const r = await loadProfile(userId, null);
    if (r.profile) setProfile(r.profile);
  }, [userId, loadProfile]);

  const retryProfile = useCallback(() => setProfileTry((n) => n + 1), []);

  const signInWithGoogle = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      // Google запрещает вход внутри встроенного окна приложения, поэтому открываем системный браузер.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) return error.message;
      if (!data?.url) return "Не удалось начать вход через Google";
      await Browser.open({ url: data.url });
      return null;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileError,
      authError,
      configError,
      retryProfile,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, profileError, authError, configError, retryProfile, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

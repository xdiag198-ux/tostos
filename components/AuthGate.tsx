import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Check, ArrowRight, AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { useAuth, isNativeApp } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function initialHandle(value?: string | null) {
  const clean = (value ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return clean.length >= 3 ? clean : "";
}

function WelcomeSetup({ onComplete }: { onComplete: () => void }) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const reduceMotion = useReducedMotion();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [handle, setHandle] = useState(() => initialHandle(profile?.handle));
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setHandle(initialHandle(profile?.handle));
    setBio(profile?.bio ?? "");
  }, [profile]);

  async function finish() {
    if (!user || !profile || busy) return;
    const cleanName = name.trim();
    const cleanHandle = handle.trim().toLowerCase();
    const cleanBio = bio.trim();
    if (!cleanName || cleanName.length > 40) return setError("Имя должно содержать от 1 до 40 символов.");
    if (!/^[a-z0-9_]{3,20}$/.test(cleanHandle)) return setError("Никнейм: 3–20 символов, только a–z, 0–9 и _.");
    if (cleanBio.length > 160) return setError("Описание не должно быть длиннее 160 символов.");

    setBusy(true);
    setError(null);
    try {
      if (cleanHandle !== profile.handle) {
        const { data: taken, error: checkError } = await supabase
          .from("profiles").select("id").eq("handle", cleanHandle).maybeSingle();
        if (checkError) throw checkError;
        if (taken && taken.id !== user.id) throw new Error("Этот никнейм уже занят. Выбери другой.");
      }

      const { error: saveError } = await supabase.from("profiles").update({
        display_name: cleanName,
        handle: cleanHandle,
        bio: cleanBio || null,
      }).eq("id", user.id);
      if (saveError) {
        if (saveError.code === "23505") throw new Error("Этот никнейм уже занят. Выбери другой.");
        throw saveError;
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { tosto_onboarding_completed: true },
      });
      if (metadataError) throw metadataError;
      await refreshProfile();
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full bg-transparent px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground outline-none";
  return (
    <div className="fixed inset-0 z-[120] bg-background overflow-y-auto">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-8 pt-[calc(2.5rem+env(safe-area-inset-top))]"
        aria-labelledby="tosto-welcome-title"
      >
        <div className="flex flex-col items-center text-center">
          <UserAvatar name={name || "?"} url={profile?.avatar_url} size="w-28 h-28" className="text-3xl" />
          <h1 id="tosto-welcome-title" className="mt-5 font-display text-xl font-bold">Регистрация</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Укажите имя и никнейм. Фото и баннер можно добавить потом на вкладке «Профиль».
          </p>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl bg-surface-1 divide-y divide-border">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="Имя" aria-label="Имя" className={field} />
          <div className="flex items-center px-4 focus-within:bg-surface-2/40">
            <span className="text-muted-foreground">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="username"
              aria-label="Никнейм"
              className="w-full bg-transparent px-2 py-3.5 text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="О себе (необязательно)" aria-label="О себе" className={`${field} resize-none`} />
        </div>
        <p className="mt-2 px-2 text-xs text-muted-foreground">Никнейм: 3–20 символов, латинские буквы, цифры и _. Его увидят другие пользователи, @никнейм в постах станет ссылкой на ваш профиль.</p>

        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <button type="button" onClick={finish} disabled={busy || !profile} className="press mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> Готово <ArrowRight className="h-4 w-4" /></>}
        </button>
        <button type="button" onClick={() => void signOut()} className="mt-3 text-center text-xs text-muted-foreground">
          Войти другим аккаунтом
        </button>
      </motion.section>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, user, profile, loading, signInWithGoogle, signOut, profileError, authError, configError, retryProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(() => user?.user_metadata?.tosto_onboarding_completed === true);
  const [profileLoadTimedOut, setProfileLoadTimedOut] = useState(false);

  useEffect(() => {
    setOnboardingDone(user?.user_metadata?.tosto_onboarding_completed === true);
    setProfileLoadTimedOut(false);
  }, [user?.id, user?.user_metadata?.tosto_onboarding_completed]);

  useEffect(() => {
    if (!session || profile) return;
    const timer = window.setTimeout(() => setProfileLoadTimedOut(true), 10000);
    return () => window.clearTimeout(timer);
  }, [session, profile]);

  if (loading) {
    return <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!session) {
    const shownError = configError ?? error ?? authError;
    return (
      <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex w-full max-w-sm flex-col items-center text-center">
          <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.08 }}>
            <Logo className="h-28 w-28" />
          </motion.div>
          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">Tosto</h1>
          <p className="mt-2 text-sm text-muted-foreground">Лента, друзья и чаты в одном приложении. Войдите, чтобы начать.</p>
          <motion.button type="button" whileTap={{ scale: 0.98 }} disabled={busy || !!configError} onClick={async () => {
            setBusy(true); setError(null);
            const err = await signInWithGoogle();
            if (err) { setError(err); setBusy(false); }
            else if (isNativeApp()) setBusy(false);
          }} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white"><GoogleIcon /></span>} Продолжить с Google
          </motion.button>
          {shownError && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-left text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{shownError}</span>
            </p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">Регистрация происходит автоматически при первом входе.</p>
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    const failed = profileError ?? (profileLoadTimedOut ? "Не удалось загрузить профиль. Проверьте подключение и таблицу profiles в Supabase." : null);
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6 text-muted-foreground">
        {failed ? (
          <>
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="max-w-sm text-center text-sm">{failed}</p>
            <div className="flex gap-2">
              <button type="button" onClick={retryProfile} className="press inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><RefreshCw className="h-4 w-4" /> Повторить</button>
              <button type="button" onClick={() => void signOut()} className="press inline-flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold text-foreground"><LogOut className="h-4 w-4" /> Выйти</button>
            </div>
          </>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin" />
        )}
      </div>
    );
  }

  if (!onboardingDone) return <WelcomeSetup onComplete={() => setOnboardingDone(true)} />;
  return <>{children}</>;
}

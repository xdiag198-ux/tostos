import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Camera, Check, AlertCircle, Trash2, ImagePlus, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { invalidateProfile } from "@/lib/profiles";
import { isSoundEnabled, playSound, setSoundEnabled } from "@/lib/sounds";
import { fetchTrackMeta } from "@/lib/trackMeta";
import { UserAvatar, nameHue } from "./UserAvatar";

type Props = {
  show: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const BUCKET = "avatars";
const BANNER_BUCKET = "banners";
const BANNER_MAX_BYTES = 8 * 1024 * 1024;
const BANNER_TYPES: Record<string, string> = {
  "image/gif": "gif",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type HandleState = "idle" | "checking" | "free" | "taken" | "invalid";

/** Сжимает фото до квадрата 256x256 (JPEG), чтобы аватарки были лёгкими. */
async function resizeToSquare(file: File, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Не удалось прочитать картинку"));
      el.src = url;
    });
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas недоступен");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось сжать фото"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileModal({ show, onClose, onSaved }: Props) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [trackFetch, setTrackFetch] = useState<"idle" | "loading" | "ok" | "partial" | "fail">("idle");
  // Что подставили автоматически: если человек потом ничего не менял, при новой ссылке заменим.
  const autoFilled = useRef({ title: "", artist: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Заполняем форму текущими данными при каждом открытии.
  useEffect(() => {
    if (!show || !profile) return;
    setName(profile.display_name);
    setHandle(profile.handle);
    setBio(profile.bio ?? "");
    setTrackUrl(profile.track_url ?? "");
    setTrackTitle(profile.track_title ?? "");
    setTrackArtist(profile.track_artist ?? "");
    setTrackFetch("idle");
    autoFilled.current = { title: "", artist: "" };
    setAvatarUrl(profile.avatar_url);
    setAvatarFile(null);
    setAvatarPreview(null);
    setBannerUrl(profile.banner_url ?? null);
    setBannerFile(null);
    setBannerPreview(null);
    setHandleState("idle");
    setError(null);
  }, [show, profile]);

  // Проверка занятости юзернейма с задержкой, пока человек печатает.
  useEffect(() => {
    if (!show || !profile) return;
    const h = handle.trim().toLowerCase();
    if (h === profile.handle) {
      setHandleState("idle");
      return;
    }
    if (!HANDLE_RE.test(h)) {
      setHandleState("invalid");
      return;
    }
    setHandleState("checking");
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("handle", h).maybeSingle();
      if (active) setHandleState(data ? "taken" : "free");
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [handle, show, profile]);

  // Автозаполнение артиста и названия, когда вставлена ссылка на трек.
  const trackTitleRef = useRef(trackTitle);
  const trackArtistRef = useRef(trackArtist);
  trackTitleRef.current = trackTitle;
  trackArtistRef.current = trackArtist;
  useEffect(() => {
    if (!show) return;
    const url = trackUrl.trim();
    if (!/^https:\/\/\S+$/i.test(url) || url === (profile?.track_url ?? "")) {
      setTrackFetch("idle");
      return;
    }
    setTrackFetch("loading");
    let active = true;
    const t = setTimeout(async () => {
      const meta = await fetchTrackMeta(url);
      if (!active) return;
      if (!meta) {
        setTrackFetch("fail");
        return;
      }
      const auto = autoFilled.current;
      if (meta.title && (trackTitleRef.current === "" || trackTitleRef.current === auto.title)) {
        setTrackTitle(meta.title);
        auto.title = meta.title;
      }
      if (meta.artist && (trackArtistRef.current === "" || trackArtistRef.current === auto.artist)) {
        setTrackArtist(meta.artist);
        auto.artist = meta.artist;
      }
      setTrackFetch(meta.title && meta.artist ? "ok" : "partial");
    }, 600);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [trackUrl, show, profile?.track_url]);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Выбери картинку (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Файл слишком большой (максимум 15 МБ)");
      return;
    }
    try {
      setError(null);
      const blob = await resizeToSquare(file);
      setAvatarFile(blob);
      setAvatarPreview(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обработать фото");
    }
  }

  function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!BANNER_TYPES[file.type]) {
      setError("Баннер: GIF, PNG, JPG или WebP");
      return;
    }
    if (file.size > BANNER_MAX_BYTES) {
      setError("Баннер слишком большой (максимум 8 МБ)");
      return;
    }
    setError(null);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    // GIF отправляем как есть, без сжатия через canvas, иначе пропадёт анимация.
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  }

  function removeBanner() {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerFile(null);
    setBannerPreview(null);
    setBannerUrl(null);
  }

  function removeAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
  }

  const trimmedName = name.trim();
  const cleanHandle = handle.trim().toLowerCase();
  const cleanTrackUrl = trackUrl.trim();
  const trackUrlOk = cleanTrackUrl === "" || /^https:\/\/\S+$/i.test(cleanTrackUrl);
  const canSave =
    !busy &&
    trackUrlOk &&
    trimmedName.length >= 1 &&
    trimmedName.length <= 40 &&
    (handleState === "idle" || handleState === "free");

  async function save() {
    if (!user || !profile || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      let nextAvatar = avatarUrl;

      if (avatarFile) {
        const path = `${user.id}/avatar-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, avatarFile, { contentType: "image/jpeg", cacheControl: "3600" });
        if (upErr) throw new Error("Не удалось загрузить аватар: " + upErr.message);
        nextAvatar = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

        // Убираем старые аватарки пользователя, оставляем только новую (не критично, если не выйдет).
        try {
          const { data: files } = await supabase.storage.from(BUCKET).list(user.id);
          const old = (files ?? [])
            .map((f) => `${user.id}/${f.name}`)
            .filter((p) => p !== path);
          if (old.length) await supabase.storage.from(BUCKET).remove(old);
        } catch {
          // игнорируем
        }
      }

      let nextBanner = bannerUrl;
      if (bannerFile) {
        const ext = BANNER_TYPES[bannerFile.type] ?? "gif";
        const path = `${user.id}/banner-${Date.now()}.${ext}`;
        const { error: bErr } = await supabase.storage
          .from(BANNER_BUCKET)
          .upload(path, bannerFile, { contentType: bannerFile.type, cacheControl: "3600" });
        if (bErr) {
          throw new Error(
            /bucket/i.test(bErr.message)
              ? "Хранилище баннеров не создано. Выполните supabase/fix_registration_and_banner.sql в Supabase."
              : "Не удалось загрузить баннер: " + bErr.message,
          );
        }
        nextBanner = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path).data.publicUrl;
        try {
          const { data: files } = await supabase.storage.from(BANNER_BUCKET).list(user.id);
          const old = (files ?? []).map((f) => `${user.id}/${f.name}`).filter((x) => x !== path);
          if (old.length) await supabase.storage.from(BANNER_BUCKET).remove(old);
        } catch {
          // не критично
        }
      } else if (!bannerUrl && profile.banner_url) {
        // баннер убрали: чистим файлы пользователя
        try {
          const { data: files } = await supabase.storage.from(BANNER_BUCKET).list(user.id);
          const old = (files ?? []).map((f) => `${user.id}/${f.name}`);
          if (old.length) await supabase.storage.from(BANNER_BUCKET).remove(old);
        } catch {
          // не критично
        }
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          display_name: trimmedName,
          handle: cleanHandle,
          bio: bio.trim() || null,
          track_url: cleanTrackUrl || null,
          track_title: cleanTrackUrl ? trackTitle.trim() || null : null,
          track_artist: cleanTrackUrl ? trackArtist.trim() || null : null,
          avatar_url: nextAvatar,
          banner_url: nextBanner,
        })
        .eq("id", user.id);

      if (updErr) {
        if (updErr.code === "23505") throw new Error("Этот юзернейм уже занят");
        if (updErr.code === "23514") throw new Error("Юзернейм: 3–20 символов, только a-z, 0-9 и _");
        if (updErr.code === "42703" || /banner_url/i.test(updErr.message)) {
          throw new Error("В базе нет колонки banner_url. Выполните supabase/fix_registration_and_banner.sql в Supabase.");
        }
        throw new Error(updErr.message);
      }

      invalidateProfile(user.id);
      await refreshProfile();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const shownAvatar = avatarPreview ?? avatarUrl;
  const shownBanner = bannerPreview ?? bannerUrl;

  return (
    <AnimatePresence>
      {show && profile && (
        <motion.div
          className="fixed inset-0 z-[60] bg-background overflow-y-auto"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <div className="sticky top-0 z-10 noir-glass border-b border-border">
            <div className="mx-auto flex w-full max-w-md items-center gap-2 px-2 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={onClose}
                aria-label="Назад"
                className="press flex h-9 w-9 items-center justify-center rounded-full text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="flex-1 font-display text-base font-semibold text-foreground">Изменить профиль</h3>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={save}
                disabled={!canSave}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-pulse disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Готово
              </motion.button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-4">
            {error && <p role="alert" className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {/* Баннер */}
            <label className="block text-xs text-muted-foreground mb-1.5">Баннер профиля (GIF, PNG, JPG, WebP до 8 МБ)</label>
            <div
              className="relative mb-2 h-32 w-full overflow-hidden rounded-2xl bg-surface-2"
              style={
                shownBanner
                  ? undefined
                  : { backgroundImage: `linear-gradient(135deg, oklch(0.5 0.12 ${nameHue(trimmedName || "?")}), oklch(0.32 0.09 ${(nameHue(trimmedName || "?") + 50) % 360}))` }
              }
            >
              {shownBanner && <img src={shownBanner} alt="Баннер" className="h-full w-full object-cover" />}
              <button
                type="button"
                onClick={() => bannerRef.current?.click()}
                aria-label="Выбрать баннер"
                className="absolute inset-0 flex items-center justify-center bg-background/30 text-foreground opacity-0 transition-opacity hover:opacity-100 active:opacity-100"
              >
                <ImagePlus className="h-6 w-6" />
              </button>
            </div>
            <div className="mb-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => bannerRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium text-foreground"
              >
                <ImagePlus className="h-4 w-4" />
                {shownBanner ? "Сменить баннер" : "Загрузить баннер"}
              </button>
              {shownBanner && (
                <button
                  type="button"
                  onClick={removeBanner}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Убрать
                </button>
              )}
              <input ref={bannerRef} type="file" accept="image/gif,image/png,image/jpeg,image/webp" onChange={pickBanner} className="hidden" />
            </div>

            {/* Аватар */}
            <div className="flex items-center gap-4 mb-5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative group rounded-full"
                aria-label="Сменить аватар"
              >
                <UserAvatar name={trimmedName || "?"} url={shownAvatar} size="w-20 h-20" className="text-xl" />
                <span className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-5 h-5 text-foreground" />
                </span>
              </button>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-sm font-medium text-foreground hover:border-pulse/40 transition-colors flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Выбрать фото
                </button>
                {shownAvatar && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="px-3.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Убрать фото
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
            </div>

            {/* Имя */}
            <label className="block text-xs text-muted-foreground mb-1.5">Имя</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="Как тебя зовут"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition mb-4"
            />

            {/* Юзернейм */}
            <label className="block text-xs text-muted-foreground mb-1.5">Юзернейм</label>
            <div className="relative mb-1.5">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="username"
                className="w-full pl-8 pr-10 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                {handleState === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {handleState === "free" && <Check className="w-4 h-4 text-pulse" />}
                {(handleState === "taken" || handleState === "invalid") && (
                  <AlertCircle className="w-4 h-4 text-destructive" />
                )}
              </span>
            </div>
            <p
              className={`text-xs mb-4 ${
                handleState === "taken" || handleState === "invalid" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {handleState === "taken"
                ? "Этот юзернейм уже занят"
                : handleState === "invalid"
                  ? "3–20 символов: латинские буквы, цифры и _"
                  : handleState === "free"
                    ? "Свободен"
                    : "Латинские буквы, цифры и _, от 3 до 20 символов"}
            </p>

            {/* О себе */}
            <label className="block text-xs text-muted-foreground mb-1.5">О себе</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              rows={3}
              placeholder="Пара слов о себе"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition resize-none"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums mt-1">{bio.length}/160</p>

            {/* Трек */}
            <label className="block text-xs text-muted-foreground mt-4 mb-1.5">Трек в профиле</label>
            <input
              value={trackUrl}
              onChange={(e) => setTrackUrl(e.target.value.slice(0, 500))}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ссылка на трек (https://…)"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition mb-2"
            />
            <div className="flex gap-2">
              <input
                value={trackArtist}
                onChange={(e) => setTrackArtist(e.target.value.slice(0, 80))}
                placeholder="Артист"
                className="min-w-0 flex-1 px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
              />
              <input
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value.slice(0, 80))}
                placeholder="Название"
                className="min-w-0 flex-1 px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
              />
            </div>
            <p className={`text-xs mt-1.5 ${trackUrlOk ? "text-muted-foreground" : "text-destructive"}`}>
              {trackUrlOk
                ? trackFetch === "loading"
                  ? "Ищу название и артиста…"
                  : trackFetch === "ok"
                    ? "Артист и название подставлены, можно поправить"
                    : trackFetch === "partial"
                      ? "Название подставлено, артиста впиши сам"
                      : trackFetch === "fail"
                        ? "Не удалось подтянуть данные, впиши артиста и название сам"
                        : "YouTube, Spotify, SoundCloud, Apple Music. Оставь пустым, чтобы убрать трек"
                : "Ссылка должна начинаться с https://"}
            </p>

            <button
              type="button"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playSound("like");
              }}
              className="mt-4 w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground"
            >
              <span>Звуки интерфейса</span>
              <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${soundOn ? "bg-primary" : "bg-surface-2"}`}>
                <span
                  className={`block w-5 h-5 rounded-full bg-background transition-transform ${soundOn ? "translate-x-4" : ""}`}
                />
              </span>
            </button>


            <button
              type="button"
              onClick={() => void signOut()}
              className="press mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Выйти из аккаунта
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImageOff, Loader2, Pause, Play, X } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { isNativeApp } from "@/lib/auth";
import { formatDuration, formatSize, getSignedUrl, useSignedUrl } from "@/lib/media";
import type { Message } from "@/types";

function ImageMessage({ m }: { m: Message }) {
  const { url, failed } = useSignedUrl(m.media_path);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return (
      <div className="w-48 h-32 rounded-xl bg-background/40 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
        <ImageOff className="w-5 h-5" />
        Не удалось загрузить
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => url && setOpen(true)} className="block relative rounded-xl overflow-hidden">
        {(!url || !loaded) && (
          <div className="w-52 h-40 bg-background/40 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {url && (
          <img
            src={url}
            alt={m.media_name ?? "Фото"}
            onLoad={() => setLoaded(true)}
            className={`max-h-72 max-w-full object-cover rounded-xl ${loaded ? "" : "absolute opacity-0 w-px h-px"}`}
          />
        )}
      </button>
      <AnimatePresence>
        {open && url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3"
          >
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              src={url}
              alt={m.media_name ?? "Фото"}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function FileMessage({ m, mine }: { m: Message; mine: boolean }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!m.media_path) return;
    setBusy(true);
    const url = await getSignedUrl(m.media_path);
    setBusy(false);
    if (!url) return;
    // В APK скачивание из WebView не работает, поэтому открываем ссылку в системном браузере.
    if (isNativeApp()) await Browser.open({ url });
    else window.open(url, "_blank", "noopener");
  }

  return (
    <button
      type="button"
      onClick={open}
      className="flex items-center gap-3 text-left min-w-[11rem] max-w-full"
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          mine ? "bg-primary-foreground/15" : "bg-background/50"
        }`}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{m.media_name ?? "Файл"}</span>
        <span className={`block text-[11px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {formatSize(m.media_size)}
        </span>
      </span>
      <Download className="w-4 h-4 shrink-0 opacity-70" />
    </button>
  );
}

function VoiceMessage({ m, mine }: { m: Message; mine: boolean }) {
  const { url, failed } = useSignedUrl(m.media_path);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const total = m.media_duration ?? 0;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function toggle() {
    if (!url) return;
    if (!audioRef.current) {
      const a = new Audio(url);
      a.ontimeupdate = () => {
        const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total || 1;
        setProgress(Math.min(1, a.currentTime / d));
      };
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      audioRef.current = a;
    }
    const a = audioRef.current;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  }

  const track = mine ? "bg-primary-foreground/25" : "bg-foreground/15";
  const fill = mine ? "bg-primary-foreground" : "bg-pulse";

  return (
    <div className="flex items-center gap-3 min-w-[12rem]">
      <button
        type="button"
        onClick={toggle}
        disabled={!url && !failed}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 ${
          mine ? "bg-primary-foreground text-primary" : "bg-pulse text-background"
        }`}
      >
        {!url && !failed ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1.5 rounded-full overflow-hidden ${track}`}>
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={`mt-1 text-[11px] tabular-nums ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {failed ? "Не удалось загрузить" : formatDuration(total)}
        </p>
      </div>
    </div>
  );
}

export function MessageMedia({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === "image") return <ImageMessage m={m} />;
  if (m.kind === "voice") return <VoiceMessage m={m} mine={mine} />;
  if (m.kind === "file") return <FileMessage m={m} mine={mine} />;
  return null;
}

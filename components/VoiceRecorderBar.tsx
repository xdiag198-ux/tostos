import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { formatDuration, pickRecorderMime } from "@/lib/media";

const MAX_SECONDS = 300;

/** Полоса записи голосового: сразу начинает запись, «корзина» отменяет, «отправить» завершает. */
export function VoiceRecorderBar({
  onSend,
  onCancel,
  onError,
}: {
  onSend: (blob: Blob, mime: string, seconds: number) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const sendRef = useRef(true);
  const doneRef = useRef(false);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          throw new Error("unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime = pickRecorderMime();
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recRef.current = rec;
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stopTracks();
          if (doneRef.current) return;
          doneRef.current = true;
          const type = rec.mimeType || mime || "audio/webm";
          const secs = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
          const blob = new Blob(chunksRef.current, { type });
          if (sendRef.current && blob.size > 0) onSend(blob, type, secs);
          else onCancel();
        };
        startedRef.current = Date.now();
        rec.start(250);
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        onError(
          denied
            ? "Нет доступа к микрофону. Разрешите его в настройках приложения."
            : "Запись голоса не поддерживается на этом устройстве.",
        );
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
      sendRef.current = false;
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!startedRef.current) return;
      const s = Math.floor((Date.now() - startedRef.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) finish(true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(send: boolean) {
    sendRef.current = send;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else onCancel();
  }

  return (
    <div className="flex items-center gap-3">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => finish(false)}
        aria-label="Отменить запись"
        className="w-10 h-10 rounded-xl hover:bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
      >
        <Trash2 className="w-5 h-5" />
      </motion.button>
      <div className="flex-1 flex items-center gap-3 bg-surface-1 border border-border rounded-2xl px-4 py-2.5">
        <motion.span
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
          className="w-2.5 h-2.5 rounded-full bg-destructive"
        />
        <span className="text-sm tabular-nums text-foreground">{formatDuration(seconds)}</span>
        <span className="text-xs text-muted-foreground">Идёт запись…</span>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => finish(true)}
        aria-label="Отправить голосовое"
        className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-noir shrink-0"
      >
        <Send className="w-4 h-4" />
      </motion.button>
    </div>
  );
}

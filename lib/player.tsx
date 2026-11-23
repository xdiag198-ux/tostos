import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Music2, Pause, Play, X } from "lucide-react";
import { embedFor } from "@/lib/embed";

export type PlayerTrack = { url: string; title: string; artist: string | null };

type Ctx = {
  track: PlayerTrack | null;
  playing: boolean;
  failed: boolean;
  play: (t: PlayerTrack) => void;
  toggle: () => void;
  stop: () => void;
};

const PlayerContext = createContext<Ctx>({
  track: null,
  playing: false,
  failed: false,
  play: () => {},
  toggle: () => {},
  stop: () => {},
});

export const usePlayer = () => useContext(PlayerContext);

/**
 * Глобальный плеер: скрытый iframe живёт здесь, а не на странице профиля,
 * поэтому музыка не прерывается при переходе между экранами.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const embed = useMemo(() => (track ? embedFor(track.url) : null), [track]);
  const kind = embed?.kind;

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const send = useCallback((msg: unknown) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
  }, []);

  const play = useCallback(
    (t: PlayerTrack) => {
      if (!embedFor(t.url)?.audioOnly) return;
      setTrack(t);
      setPlaying(true);
      setFailed(false);
      clearTimer();
      timer.current = setTimeout(() => {
        setFailed(true);
        setPlaying(false);
      }, 7000);
    },
    [clearTimer],
  );

  const stop = useCallback(() => {
    clearTimer();
    setTrack(null);
    setPlaying(false);
    setFailed(false);
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (!track) return;
    if (playing) {
      if (kind === "youtube") send({ event: "command", func: "pauseVideo", args: [] });
      else send({ method: "pause" });
      setPlaying(false);
    } else {
      setFailed(false);
      if (kind === "youtube") send({ event: "command", func: "playVideo", args: [] });
      else send({ method: "play" });
      setPlaying(true);
    }
  }, [track, playing, kind, send]);

  // События плеера: началось, пауза, конец, ошибка.
  useEffect(() => {
    if (!track) return;
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      let data: any = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      if (kind === "youtube") {
        if (data.event === "onError") {
          clearTimer();
          setFailed(true);
          setPlaying(false);
          return;
        }
        const st = data.info?.playerState ?? (data.event === "onStateChange" ? data.info : undefined);
        if (st === 1) {
          clearTimer();
          setFailed(false);
          setPlaying(true);
        } else if (st === 2 || st === 0) {
          setPlaying(false);
        }
      } else if (kind === "soundcloud") {
        if (data.method === "play") {
          clearTimer();
          setFailed(false);
          setPlaying(true);
        } else if (data.method === "pause" || data.method === "finish") {
          setPlaying(false);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [track, kind, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  function onFrameLoad() {
    if (kind === "youtube") {
      send({ event: "listening", id: 1, channel: "widget" });
    } else if (kind === "soundcloud") {
      for (const ev of ["play", "pause", "finish"]) send({ method: "addEventListener", value: ev });
    }
  }

  const value = useMemo(
    () => ({ track, playing, failed, play, toggle, stop }),
    [track, playing, failed, play, toggle, stop],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {track && embed && (
        <>
          {/* Плеер скрыт за пределами экрана: идёт только звук. */}
          <iframe
            key={track.url}
            ref={frameRef}
            src={embed.src}
            title={track.title}
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={onFrameLoad}
            aria-hidden="true"
            tabIndex={-1}
            style={{ position: "fixed", left: -10000, top: 0, width: 320, height: 240, border: 0, pointerEvents: "none" }}
          />

          {/* Мини-плеер: виден на любом экране, пока трек не закрыт. */}
          <div className="fixed inset-x-3 z-40 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-auto md:right-4 md:w-80">
            <div className="noir-glass border border-border rounded-2xl pl-2 pr-1.5 py-1.5 flex items-center gap-2.5 shadow-noir">
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Пауза" : "Играть"}
                className="w-9 h-9 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{track.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {failed ? "Не играет: открой трек в самом сервисе" : (track.artist ?? "")}
                </p>
              </div>
              <Music2 className="w-4 h-4 text-pulse shrink-0" />
              <button
                type="button"
                onClick={stop}
                aria-label="Закрыть плеер"
                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </PlayerContext.Provider>
  );
}

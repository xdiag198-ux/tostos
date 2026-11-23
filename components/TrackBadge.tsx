import { useState } from "react";
import { ChevronRight, Music2, Pause, Play } from "lucide-react";
import { embedFor, safeUrl } from "@/lib/embed";
import { usePlayer } from "@/lib/player";

/**
 * Плашка «Артист — Трек» в профиле.
 * YouTube и SoundCloud играют через глобальный плеер (звук продолжается на других экранах),
 * Spotify и Apple Music раскрывают видимый плеер под плашкой.
 */
export function TrackBadge({
  url,
  title,
  artist,
}: {
  url?: string | null;
  title?: string | null;
  artist?: string | null;
}) {
  const player = usePlayer();
  const [open, setOpen] = useState(false);

  if (!url || !safeUrl(url)) return null;
  const embed = embedFor(url);
  const main = title?.trim() || "Трек";
  const sub = artist?.trim() || null;

  const isCurrent = player.track?.url === url;
  const showPause = embed?.audioOnly ? isCurrent && player.playing : open;

  function onPress() {
    if (!embed) return;
    if (!embed.audioOnly) {
      setOpen((v) => !v);
      return;
    }
    if (isCurrent) player.toggle();
    else player.play({ url: url!, title: main, artist: sub });
  }

  return (
    <div className="mt-3 max-w-full">
      <div className="inline-flex h-10 max-w-full items-center gap-1 rounded-full bg-surface-2 border border-border pl-1.5 pr-1">
        {embed ? (
          <button
            type="button"
            onClick={onPress}
            aria-label={showPause ? "Пауза" : "Слушать"}
            className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {showPause ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center text-pulse">
            <Music2 className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 truncate pl-1 pr-1 text-sm text-foreground">
          {sub ? (
            <>
              <span className="font-semibold">{sub}</span>
              <span className="text-muted-foreground"> - {main}</span>
            </>
          ) : (
            <span className="font-semibold">{main}</span>
          )}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть в сервисе"
          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>

      {embed?.audioOnly && isCurrent && player.failed && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Этот трек нельзя проиграть внутри приложения. Открой его значком ссылки справа от названия.
        </p>
      )}

      {embed && !embed.audioOnly && open && (
        <div className="mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background">
          <iframe
            src={embed.src}
            title={`${main}${sub ? " — " + sub : ""}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            className="block w-full border-0"
            style={embed.height ? { height: embed.height } : { aspectRatio: embed.ratio ?? "16 / 9" }}
          />
        </div>
      )}
    </div>
  );
}

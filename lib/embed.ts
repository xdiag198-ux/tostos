// Адреса встроенных плееров по ссылке на трек.

export type Embed = { src: string; height: number | null; ratio?: string; kind: "youtube" | "soundcloud" | "spotify" | "apple"; audioOnly: boolean };

export function safeUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Адрес встроенного плеера по ссылке. null, если сервис не поддерживается. */
export function embedFor(url: string): Embed | null {
  const u = safeUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  // YouTube и YouTube Music
  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") id = parts[1] ?? null;
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return {
        src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&controls=0&enablejsapi=1`,
        height: null,
        ratio: "16 / 9",
        kind: "youtube",
        audioOnly: true,
      };
    }
    return null;
  }

  // SoundCloud
  if (host === "soundcloud.com" || host === "m.soundcloud.com" || host === "on.soundcloud.com") {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&visual=false&show_comments=false`,
      height: 166,
      kind: "soundcloud",
      audioOnly: true,
    };
  }

  // Spotify: /track/ID, /album/ID, /playlist/ID, /episode/ID (возможен префикс /intl-xx/)
  if (host === "open.spotify.com") {
    const i = parts.findIndex((p) => ["track", "album", "playlist", "episode", "artist"].includes(p));
    const id = i >= 0 ? parts[i + 1] : null;
    if (i >= 0 && id && /^[A-Za-z0-9]{10,30}$/.test(id)) {
      return {
        src: `https://open.spotify.com/embed/${parts[i]}/${id}`,
        height: parts[i] === "track" || parts[i] === "episode" ? 152 : 352,
        kind: "spotify",
        audioOnly: false,
      };
    }
    return null;
  }

  // Apple Music
  if (host === "music.apple.com") {
    return {
      src: `https://embed.music.apple.com${u.pathname}${u.search}`,
      height: u.searchParams.has("i") ? 175 : 450,
      kind: "apple",
      audioOnly: false,
    };
  }

  return null;
}

import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type TrackMeta = { title: string; artist: string };

type OEmbed = { title?: string; author_name?: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Выбирает oEmbed-адрес по сервису. Возвращает null, если сервис не поддерживается. */
function oembedUrl(url: string): { api: string; kind: "youtube" | "soundcloud" | "spotify" } | null {
  const host = hostOf(url);
  if (!host) return null;
  const enc = encodeURIComponent;
  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const u = host === "music.youtube.com" ? url.replace("music.youtube.com", "www.youtube.com") : url;
    return { api: `https://www.youtube.com/oembed?format=json&url=${enc(u)}`, kind: "youtube" };
  }
  if (host === "soundcloud.com" || host === "m.soundcloud.com" || host === "on.soundcloud.com") {
    return { api: `https://soundcloud.com/oembed?format=json&url=${enc(url)}`, kind: "soundcloud" };
  }
  if (host === "open.spotify.com") {
    return { api: `https://open.spotify.com/oembed?url=${enc(url)}`, kind: "spotify" };
  }
  return null;
}

async function getJson(api: string): Promise<OEmbed> {
  // В приложении запрос идёт через нативный слой (без ограничений CORS), в браузере через fetch.
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: api, headers: { Accept: "application/json" } });
    if (res.status < 200 || res.status >= 300) throw new Error("status " + res.status);
    return (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as OEmbed;
  }
  const res = await fetch(api, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("status " + res.status);
  return (await res.json()) as OEmbed;
}

/** Убирает хвосты вроде (Official Video), [Lyrics], ft. в скобках. */
function cleanTitle(s: string): string {
  return s
    .replace(/\s*[(\[][^)\]]*(official|video|audio|lyrics?|lyric video|visuali[sz]er|клип|премьера|hd|4k)[^)\]]*[)\]]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtist(s: string): string {
  return s
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\s*(official|официальный канал)$/i, "")
    .trim();
}

/** Достаёт артиста и название по ссылке. Возвращает null, если не получилось. */
export async function fetchTrackMeta(url: string): Promise<TrackMeta | null> {
  const target = oembedUrl(url);
  if (!target) return null;
  let data: OEmbed;
  try {
    data = await getJson(target.api);
  } catch {
    return null;
  }
  const rawTitle = (data.title ?? "").trim();
  const author = (data.author_name ?? "").trim();
  if (!rawTitle) return null;

  if (target.kind === "spotify") {
    // Spotify отдаёт только название трека, артиста нужно вписать руками.
    return { title: cleanTitle(rawTitle).slice(0, 80), artist: "" };
  }

  if (target.kind === "soundcloud") {
    const suffix = author ? ` by ${author}` : "";
    const title = suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;
    return { title: cleanTitle(title).slice(0, 80), artist: cleanArtist(author).slice(0, 80) };
  }

  // YouTube: чаще всего заголовок вида «Артист - Название», иначе артист это канал.
  const t = cleanTitle(rawTitle);
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: cleanArtist(m[1]).slice(0, 80), title: m[2].trim().slice(0, 80) };
  return { artist: cleanArtist(author).slice(0, 80), title: t.slice(0, 80) };
}

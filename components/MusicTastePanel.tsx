import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Music2, Plus, X, Save, Sparkles, Disc3, Loader2, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "./UserAvatar";
import { useProfileViewer } from "@/lib/profileView";

type Taste = { artists: string[]; genres: string[]; tracks: string[] };
type Match = { id: string; display_name: string; handle: string; avatar_url: string | null; score: number; shared: string[] };
const GENRES = ["Поп", "Рок", "Хип-хоп", "Инди", "Электроника", "R&B", "Джаз", "Классика", "Метал", "Альтернатива", "K-pop", "Саундтреки", "Фолк", "Другое"];
const EMPTY: Taste = { artists: [], genres: [], tracks: [] };
const clean = (v: string[]) => [...new Set(v.map(x => x.trim()).filter(Boolean))].slice(0, 10);

export function MusicTastePanel({ userId }: { userId: string }) {
  const { user } = useAuth();
  const { openProfile } = useProfileViewer();
  const own = user?.id === userId;
  const [taste, setTaste] = useState<Taste>(EMPTY);
  const [draft, setDraft] = useState<Taste>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [artistInput, setArtistInput] = useState("");
  const [trackInput, setTrackInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const welcomeKey = `tosto-taste-intro:${userId}`;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: e } = await (supabase as any).from("music_preferences").select("artists,genres,tracks").eq("user_id", userId).maybeSingle();
    if (e) {
      console.error("[Tosto music] load failed:", e);
      setError(`Не удалось загрузить музыкальный профиль: ${e.message || e.code || "неизвестная ошибка"}${e.code ? ` (код ${e.code})` : ""}`);
    }
    const value = data ? { artists: data.artists ?? [], genres: data.genres ?? [], tracks: data.tracks ?? [] } : EMPTY;
    setTaste(value); setDraft(value);
    if (own && !data && typeof window !== "undefined" && !window.localStorage.getItem(`tosto-taste-intro:${userId}`)) setWelcomeOpen(true);
    setLoading(false);
  }, [userId, own]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || (!taste.artists.length && !taste.genres.length)) { setMatches([]); return; }
    let alive = true;
    void (async () => {
      const { data, error: matchesError } = await (supabase as any).from("music_preferences").select("user_id,artists,genres").neq("user_id", userId).limit(150);
      if (matchesError) console.error("[Tosto music] matches query failed:", matchesError);
      if (!alive || !data) return;
      const ids = data.map((r: any) => r.user_id);
      if (!ids.length) { setMatches([]); return; }
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,display_name,handle,avatar_url").in("id", ids);
      if (profilesError) console.error("[Tosto music] profiles query failed:", profilesError);
      const byId = new Map((profiles ?? []).map(p => [p.id, p]));
      const norm = (v: string) => v.toLocaleLowerCase().trim();
      const result: Match[] = data.map((r: any) => {
        const sharedArtists = (r.artists ?? []).filter((x: string) => taste.artists.some(y => norm(x) === norm(y)));
        const sharedGenres = (r.genres ?? []).filter((x: string) => taste.genres.some(y => norm(x) === norm(y)));
        const artistScore = taste.artists.length ? sharedArtists.length / taste.artists.length : 0;
        const genreScore = taste.genres.length ? sharedGenres.length / taste.genres.length : 0;
        const score = Math.round((artistScore * 0.7 + genreScore * 0.3) * 100);
        const p = byId.get(r.user_id);
        return p && score > 0 ? { ...p, score, shared: [...sharedArtists, ...sharedGenres] } : null;
      }).filter((x: Match | null): x is Match => x !== null).sort((a, b) => b.score - a.score).slice(0, 8);
      setMatches(result);
    })();
    return () => { alive = false; };
  }, [loading, taste, userId]);

  const save = async () => {
    if (!user) return;
    setSaving(true); setError("");
    const payload = { user_id: user.id, artists: clean(draft.artists), genres: clean(draft.genres), tracks: clean(draft.tracks), updated_at: new Date().toISOString() };
    const { error: e } = await (supabase as any).from("music_preferences").upsert(payload, { onConflict: "user_id" });
    if (e) {
      console.error("[Tosto music] save failed:", e);
      setError(`Не удалось сохранить музыкальный профиль: ${e.message || e.code || "неизвестная ошибка"}${e.code ? ` (код ${e.code})` : ""}`);
    }
    else { const next = { artists: payload.artists, genres: payload.genres, tracks: payload.tracks }; setTaste(next); setDraft(next); setEditing(false); setWelcomeOpen(false); if (typeof window !== "undefined") window.localStorage.setItem(welcomeKey, "1"); }
    setSaving(false);
  };
  const add = (field: "artists" | "tracks", value: string) => {
    const next = clean([...draft[field], value]);
    setDraft(d => ({ ...d, [field]: next }));
    field === "artists" ? setArtistInput("") : setTrackInput("");
  };
  const hasTaste = taste.artists.length || taste.genres.length || taste.tracks.length;
  const skipWelcome = () => {
    setWelcomeOpen(false);
    if (typeof window !== "undefined") window.localStorage.setItem(welcomeKey, "1");
  };

  return <>
  {welcomeOpen && own && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface-1 shadow-2xl">
      <div className="relative overflow-hidden border-b border-border px-6 pb-5 pt-6">
        <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-pulse/20 blur-3xl" />
        <div className="relative flex items-center justify-between"><span className="font-display text-xs font-black tracking-[.45em] text-pulse">T O S T O</span><button onClick={skipWelcome} className="text-xs text-muted-foreground">Позже</button></div>
        <div className="relative mt-6 flex items-center gap-2">{[0,1,2,3].map(i=><span key={i} className={`h-1.5 flex-1 rounded-full ${i <= welcomeStep ? "bg-pulse" : "bg-surface-3"}`} />)}</div>
      </div>
      <div className="min-h-[250px] px-6 py-7">
        {welcomeStep === 0 ? <><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pulse/15 text-pulse"><Headphones className="h-7 w-7" /></div><h2 className="font-display text-2xl font-bold text-foreground">Музыка объединяет</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Расскажи, что тебе нравится слушать. Tosto поможет находить людей с похожим музыкальным вкусом и общие темы для общения.</p></> : welcomeStep === 1 ? <><h2 className="font-display text-xl font-bold text-foreground">Твои исполнители</h2><p className="mb-4 mt-2 text-sm text-muted-foreground">Добавь до 10 любимых исполнителей.</p><div className="flex gap-2"><input value={artistInput} onChange={e=>setArtistInput(e.target.value)} onKeyDown={e=>e.key === "Enter" && (e.preventDefault(), add("artists", artistInput))} placeholder="Например, The Weeknd" className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-foreground outline-none focus:border-pulse"/><button onClick={()=>add("artists",artistInput)} disabled={!artistInput.trim() || draft.artists.length>=10} className="rounded-xl bg-pulse px-4 text-white disabled:opacity-40"><Plus className="h-4 w-4"/></button></div><div className="mt-4 flex flex-wrap gap-2">{draft.artists.map(a=><button key={a} onClick={()=>setDraft(d=>({...d,artists:d.artists.filter(x=>x!==a)}))} className="flex items-center gap-1 rounded-full bg-pulse/10 px-3 py-2 text-xs text-foreground">{a}<X className="h-3 w-3"/></button>)}</div></> : welcomeStep === 2 ? <><h2 className="font-display text-xl font-bold text-foreground">Любимые жанры</h2><p className="mb-4 mt-2 text-sm text-muted-foreground">Выбери жанры, которые чаще всего включаешь. До 10 вариантов.</p><div className="flex flex-wrap gap-2">{GENRES.map(g=><button key={g} onClick={()=>setDraft(d=>({...d,genres:d.genres.includes(g)?d.genres.filter(x=>x!==g):clean([...d.genres,g])}))} className={`rounded-full border px-3 py-2.5 text-xs transition-colors ${draft.genres.includes(g)?"border-pulse bg-pulse/15 text-foreground":"border-border bg-surface-2 text-muted-foreground"}`}>{g}</button>)}</div></> : <><h2 className="font-display text-xl font-bold text-foreground">Треки на повторе</h2><p className="mb-4 mt-2 text-sm text-muted-foreground">Добавь до 10 любимых треков — тех, к которым возвращаешься снова.</p><div className="flex gap-2"><input value={trackInput} onChange={e=>setTrackInput(e.target.value)} onKeyDown={e=>e.key === "Enter" && (e.preventDefault(), add("tracks",trackInput))} placeholder="Название — исполнитель" className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-foreground outline-none focus:border-pulse"/><button onClick={()=>add("tracks",trackInput)} disabled={!trackInput.trim() || draft.tracks.length>=10} className="rounded-xl bg-pulse px-4 text-white disabled:opacity-40"><Plus className="h-4 w-4"/></button></div><div className="mt-4 space-y-2">{draft.tracks.map(t=><button key={t} onClick={()=>setDraft(d=>({...d,tracks:d.tracks.filter(x=>x!==t)}))} className="flex w-full items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left text-xs text-foreground"><Music2 className="h-4 w-4 text-pulse"/>{t}<X className="ml-auto h-3 w-3"/></button>)}</div></>}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-6 py-4">
        {welcomeStep > 0 && <button onClick={()=>setWelcomeStep(v=>v-1)} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground">Назад</button>}
        {welcomeStep < 3 ? <button onClick={()=>setWelcomeStep(v=>v+1)} className="flex-1 rounded-xl bg-pulse py-3 text-sm font-bold text-white">{welcomeStep===0?"Начать":"Далее"}</button> : <button onClick={()=>void save()} disabled={saving} className="flex-1 rounded-xl bg-pulse py-3 text-sm font-bold text-white disabled:opacity-60">{saving?"Сохраняем…":"Сохранить профиль"}</button>}
      </div>
    </motion.div>
  </div>}
  <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface-1">
    <div className="relative overflow-hidden border-b border-border px-4 py-4">
      <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-pulse/10 blur-2xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse/15 text-pulse"><Headphones className="h-5 w-5" /></div>
          <div><h3 className="font-display text-base font-bold text-foreground">Музыкальный вкус</h3><p className="text-xs text-muted-foreground">Находи людей на одной волне</p></div>
        </div>
        {own && <motion.button whileTap={{ scale: .94 }} onClick={() => { setDraft(taste); setEditing(v => !v); }} className="rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground">{editing ? "Отмена" : hasTaste ? "Изменить" : "Настроить"}</motion.button>}
      </div>
    </div>
    {loading ? <div className="flex justify-center py-7"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
    <div className="p-4">
      {editing ? <div className="space-y-4">
        <div><label className="mb-2 block text-xs font-semibold text-muted-foreground">ЛЮБИМЫЕ ИСПОЛНИТЕЛИ · ДО 10</label><div className="flex gap-2"><input value={artistInput} onChange={e => setArtistInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add("artists", artistInput))} placeholder="Например, The Weeknd" className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-pulse" /><button onClick={() => add("artists", artistInput)} disabled={!artistInput.trim() || draft.artists.length >= 10} className="rounded-xl bg-pulse px-3 text-white disabled:opacity-40"><Plus className="h-4 w-4" /></button></div><div className="mt-2 flex flex-wrap gap-2">{draft.artists.map(a => <button key={a} onClick={() => setDraft(d => ({...d, artists:d.artists.filter(x=>x!==a)}))} className="flex items-center gap-1 rounded-full bg-pulse/10 px-3 py-1.5 text-xs text-foreground">{a}<X className="h-3 w-3" /></button>)}</div></div>
        <div><label className="mb-2 block text-xs font-semibold text-muted-foreground">ЖАНРЫ · ДО 10</label><div className="flex flex-wrap gap-2">{GENRES.map(g => <button key={g} onClick={() => setDraft(d => ({...d, genres:d.genres.includes(g)?d.genres.filter(x=>x!==g):clean([...d.genres,g])}))} className={`rounded-full border px-3 py-2 text-xs transition-colors ${draft.genres.includes(g)?"border-pulse bg-pulse/15 text-foreground":"border-border bg-surface-2 text-muted-foreground"}`}>{g}</button>)}</div></div>
        <div><label className="mb-2 block text-xs font-semibold text-muted-foreground">ЛЮБИМЫЕ ТРЕКИ · ДО 10</label><div className="flex gap-2"><input value={trackInput} onChange={e => setTrackInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add("tracks", trackInput))} placeholder="Название трека — исполнитель" className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-pulse" /><button onClick={() => add("tracks", trackInput)} disabled={!trackInput.trim() || draft.tracks.length>=10} className="rounded-xl bg-pulse px-3 text-white disabled:opacity-40"><Plus className="h-4 w-4" /></button></div><div className="mt-2 flex flex-wrap gap-2">{draft.tracks.map(t=><button key={t} onClick={()=>setDraft(d=>({...d,tracks:d.tracks.filter(x=>x!==t)}))} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-foreground">{t}<X className="h-3 w-3"/></button>)}</div></div>
        <motion.button whileTap={{scale:.98}} onClick={() => void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-pulse py-3 text-sm font-bold text-white disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Сохранить музыкальный профиль</motion.button>
      </div> : <>
        {!hasTaste ? <div className="py-3 text-center"><Disc3 className="mx-auto mb-2 h-8 w-8 text-muted-foreground"/><p className="text-sm text-muted-foreground">{own ? "Добавь любимых исполнителей и жанры — Tosto найдёт музыкальных единомышленников." : "Пользователь пока не заполнил музыкальные предпочтения."}</p></div> :
        <div className="space-y-3">
          {!!taste.artists.length && <div><p className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground">ИСПОЛНИТЕЛИ</p><div className="flex flex-wrap gap-2">{taste.artists.map(a=><span key={a} className="rounded-full bg-pulse/10 px-3 py-1.5 text-xs font-medium text-foreground">{a}</span>)}</div></div>}
          {!!taste.genres.length && <div><p className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground">ЖАНРЫ</p><div className="flex flex-wrap gap-2">{taste.genres.map(g=><span key={g} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-foreground">{g}</span>)}</div></div>}
          {!!taste.tracks.length && <div><p className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground">ЛЮБИМЫЕ ТРЕКИ</p>{taste.tracks.map(t=><div key={t} className="flex items-center gap-2 py-1 text-sm text-foreground"><Music2 className="h-4 w-4 text-pulse"/>{t}</div>)}</div>}
        </div>}
        {own && <div className="mt-4 border-t border-border pt-4"><div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-pulse"/><h4 className="text-sm font-bold text-foreground">Музыкальные совпадения</h4></div>
          {!hasTaste ? <p className="text-xs text-muted-foreground">Заполни профиль, чтобы увидеть совпадения.</p> : matches.length ? <div className="space-y-2">{matches.map(m=><button key={m.id} onClick={()=>openProfile(m.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-2"><UserAvatar name={m.display_name} url={m.avatar_url} size="w-10 h-10"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{m.display_name}</span><span className="block truncate text-xs text-muted-foreground">@{m.handle} · {m.shared.slice(0,2).join(", ")}</span></span><span className="rounded-full bg-pulse/15 px-2.5 py-1 text-xs font-bold text-pulse">{m.score}%</span></button>)}</div> : <p className="text-xs text-muted-foreground">Пока нет совпадений. Они появятся, когда другие пользователи заполнят музыкальный профиль.</p>}
        </div>}
      </>}
      {!!error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
    </div>}
  </section>
  </>;
}

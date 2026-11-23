import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search as SearchIcon, X } from "lucide-react";
import type { Post, Profile } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFollowing } from "@/lib/follows";
import { useProfileViewer } from "@/lib/profileView";
import { POST_SELECT, fetchMyReactions, mapPosts, usePostActions, type PostRow } from "@/lib/posts";
import { UserAvatar } from "./UserAvatar";
import { FollowButton } from "./FollowButton";
import { PostsView } from "./PostsView";

type Tab = "people" | "posts";

export function Search({ initialQuery = "" }: { initialQuery?: string }) {
  const { user } = useAuth();
  const meId = user?.id ?? "";
  const { openProfile } = useProfileViewer();
  const { ids: followingIds, busyId, toggle } = useFollowing(meId);

  const [tab, setTab] = useState<Tab>("people");
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInput(initialQuery);
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 280);
    return () => clearTimeout(t);
  }, [input]);

  const run = useCallback(async () => {
    if (!meId) return;
    setLoading(true);
    setError(null);
    // «@» в начале и спецсимволы фильтров не должны ломать запрос
    const q = query.trim().replace(/^@+/, "").replace(/[%,()*\\]/g, "").trim();

    if (tab === "people") {
      let req = supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio")
        .neq("id", meId)
        .limit(30);
      req = q
        ? req.or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`).order("display_name")
        : req.order("created_at", { ascending: false });
      const { data, error: e } = await req;
      if (e) setError(e.message);
      setPeople((data ?? []) as Profile[]);
    } else if (q) {
      const [res, mine] = await Promise.all([
        supabase
          .from("posts")
          .select(POST_SELECT)
          .ilike("body", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(50),
        fetchMyReactions(meId),
      ]);
      if (res.error) setError(res.error.message);
      setPosts(mapPosts((res.data ?? []) as unknown as PostRow[], mine.liked, mine.reposted));
    } else {
      setPosts([]);
    }
    setLoading(false);
  }, [meId, query, tab]);

  useEffect(() => {
    run();
  }, [run]);

  const actions = usePostActions(meId, setPosts, run);

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="sticky top-0 z-10 noir-glass border-b border-border px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-2">
        <div className="relative group">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-pulse transition-colors" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 60))}
            placeholder={tab === "people" ? "Имя или @юзернейм" : "Текст поста или #тег"}
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
          />
          {input && (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => setInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex mt-2">
          {([
            { id: "people", label: "Люди" },
            { id: "posts", label: "Посты" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex-1 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {tab === t.id && (
                <motion.span
                  layoutId="search-tab"
                  className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full bg-pulse shadow-pulse-glow"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`transition-opacity duration-150 ${loading && (people.length > 0 || posts.length > 0) ? "opacity-60" : "opacity-100"}`}>
      {loading && people.length === 0 && posts.length === 0 ? (
        <div className="anim-fade">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3">
              <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1">
                <div className="skeleton h-3.5 w-32 rounded-full" />
                <div className="skeleton mt-2 h-3 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="py-16 text-center text-destructive text-sm px-4">Не удалось выполнить поиск. {error}</p>
      ) : tab === "people" ? (
        <div>
          {!query.trim() && (
            <p className="px-5 pt-4 pb-1 text-xs uppercase tracking-wider text-muted-foreground">Новые в Tosto</p>
          )}
          {people.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground text-sm px-6">Никого не нашли</p>
          ) : (
            people.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                role="button"
                tabIndex={0}
                onClick={() => openProfile(p.id)}
                onKeyDown={(e) => e.key === "Enter" && openProfile(p.id)}
                className="flex items-center gap-3 px-5 py-3 border-b border-border tap cursor-pointer"
              >
                <UserAvatar name={p.display_name} url={p.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">@{p.handle}</p>
                  {p.bio && <p className="text-xs text-foreground/70 mt-0.5 line-clamp-1">{p.bio}</p>}
                </div>
                <FollowButton
                  small
                  following={followingIds.has(p.id)}
                  busy={busyId === p.id}
                  onClick={() => toggle(p.id)}
                />
              </motion.div>
            ))
          )}
        </div>
      ) : !query.trim() ? (
        <p className="py-16 text-center text-muted-foreground text-sm px-6">
          Введите слово или #тег, чтобы найти посты.
        </p>
      ) : posts.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-sm px-6">Постов с таким текстом нет</p>
      ) : (
        <PostsView posts={posts} meId={meId} actions={actions} />
      )}
      </div>
    </div>
  );
}

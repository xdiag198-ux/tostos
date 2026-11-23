import { haptic } from "@/lib/haptics";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Repeat, Trash2, Loader2, SendHorizontal, ArrowDown, RefreshCw } from "lucide-react";
import type { Post, PostComment, Profile } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getProfile } from "@/lib/profiles";
import { countLabel, timeAgo } from "@/lib/format";
import { useProfileViewer } from "@/lib/profileView";
import { POST_SELECT, fetchMyReactions, mapPosts, usePostActions, type PostRow } from "@/lib/posts";
import { RichText } from "@/lib/mentions";
import { UserAvatar } from "./UserAvatar";

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles: Profile | null;
};

/* ───────────── Комментарии ───────────── */

function Comments({
  postId,
  onCount,
}: {
  postId: string;
  onCount: (n: number) => void;
}) {
  const { user } = useAuth();
  const { openProfile } = useProfileViewer();
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("post_comments")
      .select("id, post_id, author_id, body, created_at, profiles!author_id(id, display_name, handle, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as unknown as CommentRow[];
        setComments(rows.map(({ profiles, ...c }) => ({ ...c, author: profiles })));
      });

    const channel = supabase
      .channel(`comments-${postId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_comments", filter: `post_id=eq.${postId}` },
        async (payload) => {
          const row = payload.new as Omit<PostComment, "author">;
          const author = await getProfile(row.author_id);
          if (!active) return;
          setComments((prev) =>
            !prev || prev.some((c) => c.id === row.id) ? prev : [...prev, { ...row, author }],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [postId]);

  useEffect(() => {
    if (comments) onCount(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments]);

  async function submit() {
    const body = text.trim();
    if (!body || !user) return;
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, author_id: user.id, body })
      .select("id, post_id, author_id, body, created_at")
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const author = await getProfile(user.id);
    const row = data as Omit<PostComment, "author">;
    setText("");
    setComments((prev) =>
      prev && prev.some((c) => c.id === row.id) ? prev : [...(prev ?? []), { ...row, author }],
    );
  }

  async function remove(id: string) {
    const { error: delError } = await supabase.from("post_comments").delete().eq("id", id);
    if (!delError) setComments((prev) => prev?.filter((c) => c.id !== id) ?? prev);
  }

  return (
    <div className="anim-fade-up mt-3 pt-3 border-t border-border space-y-3">
      {comments === null ? (
        <div className="flex justify-center py-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <button type="button" onClick={() => openProfile(c.author_id)} aria-label="Открыть профиль">
              <UserAvatar
                name={c.author?.display_name ?? "?"}
                url={c.author?.avatar_url}
                size="w-8 h-8"
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => openProfile(c.author_id)}
                  className="font-semibold text-foreground truncate hover:underline"
                >
                  {c.author?.display_name ?? "Пользователь"}
                </button>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
                {c.author_id === user?.id && (
                  <button
                    type="button"
                    aria-label="Удалить комментарий"
                    onClick={() => remove(c.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="selectable text-sm text-foreground/95 whitespace-pre-line break-words"><RichText text={c.body} /></p>
            </div>
          </div>
        ))
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Написать комментарий…"
          className="flex-1 px-3.5 py-2 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || busy}
          aria-label="Отправить комментарий"
          className="press w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ───────────── Скелетон ───────────── */

function PostSkeleton({ i }: { i: number }) {
  return (
    <div className="stagger-in flex gap-3 border-b border-border px-4 py-3.5" style={{ ["--i" as string]: i }}>
      <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
      <div className="flex-1">
        <div className="skeleton h-3.5 w-36 rounded-full" />
        <div className="skeleton mt-3 h-3.5 w-full rounded-full" />
        <div className="skeleton mt-2 h-3.5 w-4/5 rounded-full" />
        <div className="mt-4 flex gap-6">
          <div className="skeleton h-3 w-8 rounded-full" />
          <div className="skeleton h-3 w-8 rounded-full" />
          <div className="skeleton h-3 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* ───────────── Карточка поста ───────────── */

type PostCardProps = {
  post: Post;
  index: number;
  meId: string;
  onLike: (post: Post) => void;
  onRepost: (post: Post) => void;
  onDelete: (post: Post) => void;
  onCommentCount: (postId: string, count: number) => void;
};

/**
 * Карточка поста. Без layout-анимаций и пружин: в ленте из десятков постов они тормозят.
 * memo: при лайке перерисовывается только одна карточка, а не вся лента.
 */
export const PostCard = memo(function PostCard({
  post,
  index,
  meId,
  onLike,
  onRepost,
  onDelete,
  onCommentCount,
}: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [burst, setBurst] = useState(0);
  const { openProfile } = useProfileViewer();
  const name = post.author?.display_name ?? "Пользователь";

  return (
    <article
      className={`cv-auto px-4 py-3.5 border-b border-border transition-colors hover:bg-surface-1/50 ${index < 6 ? "anim-fade-up" : ""}`}
      style={index < 6 ? { animationDelay: `${index * 35}ms` } : undefined}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => openProfile(post.author_id)}
          aria-label="Открыть профиль"
          className="press self-start rounded-full"
        >
          <UserAvatar name={name} url={post.author?.avatar_url} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => openProfile(post.author_id)}
              className="flex items-center gap-1.5 min-w-0 text-left"
            >
              <span className="font-semibold text-foreground truncate">{name}</span>
              {post.author && <span className="text-muted-foreground truncate">@{post.author.handle}</span>}
            </button>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground text-xs shrink-0">{timeAgo(post.created_at)}</span>
            {post.author_id === meId && (
              <button
                type="button"
                aria-label="Удалить пост"
                onClick={() => onDelete(post)}
                className="press ml-auto p-1 text-muted-foreground active:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="selectable mt-1 text-[15px] leading-[1.45] text-foreground/95 whitespace-pre-line break-words">
            <RichText text={post.body} />
          </p>

          <div className="mt-2 flex items-center gap-5 text-muted-foreground -ml-2">
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              className={`press flex items-center gap-1 px-2 py-1.5 rounded-full ${showComments ? "text-foreground" : ""}`}
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              <span className="text-xs tabular-nums min-w-3">{countLabel(post.comment_count)}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic("light");
                onRepost(post);
              }}
              aria-label={post.reposted_by_me ? "Убрать репост" : "Репост"}
              className={`press flex items-center gap-1 px-2 py-1.5 rounded-full ${post.reposted_by_me ? "text-pulse" : ""}`}
            >
              <Repeat className="w-[18px] h-[18px]" />
              <span className="text-xs tabular-nums min-w-3">{countLabel(post.repost_count)}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic(post.liked_by_me ? "light" : "medium");
                if (!post.liked_by_me) setBurst((b) => b + 1);
                onLike(post);
              }}
              aria-label={post.liked_by_me ? "Убрать лайк" : "Лайк"}
              className={`press relative flex items-center gap-1 px-2 py-1.5 rounded-full ${post.liked_by_me ? "text-rose-pulse" : ""}`}
            >
              {burst > 0 && <span key={burst} aria-hidden="true" className="like-ring" style={{ left: 8, right: "auto", margin: "auto 0" }} />}
              <Heart
                key={post.liked_by_me ? "liked" : "unliked"}
                className={`w-[18px] h-[18px] ${post.liked_by_me ? "fill-current anim-like" : ""}`}
              />
              <span className="text-xs tabular-nums min-w-3">{countLabel(post.like_count)}</span>
            </button>
          </div>

          {showComments && <Comments postId={post.id} onCount={(n) => onCommentCount(post.id, n)} />}
        </div>
      </div>
    </article>
  );
});

/* ───────────── Лента ───────────── */

const PAGE = 40;
const PULL_TRIGGER = 70;

export function Feed() {
  const { user } = useAuth();
  const meId = user?.id ?? "";
  const [tab, setTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pullRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!meId) return;
    setError(null);
    let query = supabase
      .from("posts")
      .select(POST_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (tab === "following") {
      const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", meId);
      query = query.in("author_id", [meId, ...(f ?? []).map((x) => x.following_id)]);
    }
    const [postsRes, mine] = await Promise.all([query, fetchMyReactions(meId)]);
    if (postsRes.error) {
      setError(postsRes.error.message);
      setLoading(false);
      return;
    }
    const rows = (postsRes.data ?? []) as unknown as PostRow[];
    setHasMore(rows.length > limit);
    setPosts(mapPosts(rows.slice(0, limit), mine.liked, mine.reposted));
    setLoading(false);
  }, [meId, tab, limit]);

  const loadRef = useRef(load);
  loadRef.current = load;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    load();
  }, [load]);

  // Реалтайм отдельно от загрузки: новый пост догружаем одним запросом, а не перечитываем всю ленту.
  useEffect(() => {
    if (!meId) return;
    setLoading(true);
    const channel = supabase
      .channel(`posts-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload) => {
        if (tabRef.current === "following") {
          loadRef.current();
          return;
        }
        const id = (payload.new as { id?: string }).id;
        if (!id) return;
        const { data } = await supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
        if (!data) return;
        const [post] = mapPosts([data as unknown as PostRow], new Set(), new Set());
        setPosts((prev) => (prev.some((p) => p.id === id) ? prev : [post, ...prev]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setPosts((prev) => prev.filter((p) => p.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meId]);

  useEffect(() => {
    setLimit(PAGE);
    setLoading(true);
  }, [tab]);

  const reload = useCallback(() => loadRef.current(), []);
  const { toggleLike, toggleRepost, deletePost, setCommentCount } = usePostActions(meId, setPosts, reload);

  /** Потянуть вниз от самого верха, чтобы обновить ленту. */
  useEffect(() => {
    const el = scrollRef.current;
    const ind = pullRef.current;
    if (!el || !ind) return;
    let startY = 0;
    let pull = 0;
    let active = false;

    const set = (y: number, animate: boolean) => {
      ind.style.transition = animate ? "transform 0.22s cubic-bezier(0.23,1,0.32,1), opacity 0.22s" : "none";
      ind.style.transform = `translate3d(0,${y}px,0)`;
      ind.style.opacity = String(Math.max(0, Math.min(1, y / 50)));
    };

    const start = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      active = true;
      pull = 0;
    };
    const move = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) {
        if (pull > 0) set(0, false);
        pull = 0;
        return;
      }
      pull = Math.min(dy * 0.5, 90);
      set(pull - 40, false);
      if (e.cancelable && dy > 12) e.preventDefault();
    };
    const end = async () => {
      if (!active) return;
      active = false;
      if (pull >= PULL_TRIGGER * 0.5) {
        haptic("medium");
        set(14, true);
        setRefreshing(true);
        await loadRef.current();
        setRefreshing(false);
      }
      set(-40, true);
      pull = 0;
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    set(-40, false);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <div ref={scrollRef} className="relative flex-1 h-full overflow-y-auto">
      <div
        ref={pullRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 -ml-4 top-24 z-20 w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted-foreground"
        style={{ opacity: 0 }}
      >
        {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4" />}
      </div>

      <div className="sticky top-0 z-10 noir-glass border-b border-border">
        <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-1">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Лента</h2>
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            aria-label="Обновить"
            className="press hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-muted-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex px-3">
          {([
            { id: "all", label: "Все" },
            { id: "following", label: "Подписки" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (tab !== t.id) haptic("light");
                setTab(t.id);
              }}
              className={`relative flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
              {tab === t.id && (
                <motion.span
                  layoutId="feed-tab"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full bg-pulse shadow-pulse-glow"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <PostSkeleton key={i} i={i} />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-destructive text-sm px-4">Не удалось загрузить ленту. {error}</div>
        ) : posts.length === 0 ? (
          <div className="anim-fade-up py-20 text-center px-6">
            <p className="text-foreground text-base font-medium mb-1.5">
              {tab === "following" ? "Пока нет постов от тех, на кого вы подписаны" : "Здесь пока пусто"}
            </p>
            <p className="text-muted-foreground text-sm">
              {tab === "following"
                ? "Найдите людей во вкладке «Поиск» и подпишитесь на них."
                : "Создайте первый пост — он сразу появится в ленте у всех."}
            </p>
          </div>
        ) : (
          posts.map((p, i) => (
            <PostCard
              key={p.id}
              post={p}
              index={i}
              meId={meId}
              onLike={toggleLike}
              onRepost={toggleRepost}
              onDelete={deletePost}
              onCommentCount={setCommentCount}
            />
          ))
        )}
      </div>

      {!loading && posts.length > 0 && (
        <div className="py-8 text-center">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="press px-5 py-2.5 rounded-full bg-surface-2 text-sm font-medium text-foreground"
            >
              Показать ещё
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Это всё на сегодня</span>
          )}
        </div>
      )}
    </div>
  );
}

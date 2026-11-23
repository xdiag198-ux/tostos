import { motion } from "framer-motion";
import { useCallback, useEffect, useId, useState } from "react";
import { ArrowLeft, Calendar, Loader2, MessageCircle, Pencil, X } from "lucide-react";
import { RichText } from "@/lib/mentions";
import type { Post, Profile } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { countLabel } from "@/lib/format";
import { useProfileViewer } from "@/lib/profileView";
import { POST_SELECT, fetchMyReactions, mapPosts, usePostActions, type PostRow } from "@/lib/posts";
import { UserAvatar, nameHue } from "./UserAvatar";
import { FollowButton } from "./FollowButton";
import { TrackBadge } from "./TrackBadge";
import { PostsView } from "./PostsView";
import { MusicTastePanel } from "./MusicTastePanel";

type Stats = { posts: number; followers: number; following: number; likes: number; reposts: number };
type Tab = "posts" | "reposts";
type ListKind = "followers" | "following";
type ListRow = { profiles: Profile | null };

const EMPTY_STATS: Stats = { posts: 0, followers: 0, following: 0, likes: 0, reposts: 0 };

function FollowList({ userId, kind, onClose }: { userId: string; kind: ListKind; onClose: () => void }) {
  const { openProfile } = useProfileViewer();
  const [rows, setRows] = useState<Profile[] | null>(null);

  useEffect(() => {
    const cols = "id, display_name, handle, avatar_url";
    const req =
      kind === "followers"
        ? supabase.from("follows").select(`profiles!follower_id(${cols})`).eq("following_id", userId)
        : supabase.from("follows").select(`profiles!following_id(${cols})`).eq("follower_id", userId);
    req
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as ListRow[]).map((r) => r.profiles).filter(Boolean) as Profile[];
        setRows(list);
      });
  }, [userId, kind]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[75dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-border overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">
            {kind === "followers" ? "Подписчики" : "Подписки"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {rows === null ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Пока никого</p>
          ) : (
            rows.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onClose();
                  openProfile(p.id);
                }}
                className="tap w-full flex items-center gap-3 px-5 py-3 text-left"
              >
                <UserAvatar name={p.display_name} url={p.avatar_url} size="w-10 h-10" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">@{p.handle}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ProfilePage({
  userId,
  onClose,
  onEdit,
  onMessage,
  embedded = false,
}: {
  userId: string;
  /** Нет в режиме вкладки «Профиль»: там кнопки «Назад» нет. */
  onClose?: () => void;
  onEdit: () => void;
  onMessage: (chatId: string) => void;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const tabLayoutId = useId(); // у вкладки профиля и у страницы чужого профиля свои анимации индикатора
  const meId = user?.id ?? "";
  const isMe = userId === meId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [msgBusy, setMsgBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [list, setList] = useState<ListKind | null>(null);

  const loadHead = useCallback(async () => {
    const [p, s, f] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio, banner_url, created_at, track_url, track_title, track_artist")
        .eq("id", userId)
        .maybeSingle(),
      supabase.rpc("profile_stats", { uid: userId }),
      isMe || !meId
        ? Promise.resolve(null)
        : supabase
            .from("follows")
            .select("follower_id", { count: "exact", head: true })
            .eq("follower_id", meId)
            .eq("following_id", userId),
    ]);
    if (!p.data) {
      setNotFound(true);
      return;
    }
    setProfile(p.data as Profile);
    const row = Array.isArray(s.data) ? s.data[0] : null;
    if (row) {
      setStats({
        posts: Number(row.posts),
        followers: Number(row.followers),
        following: Number(row.following),
        likes: Number(row.likes),
        reposts: Number(row.reposts),
      });
    }
    setFollowing((f?.count ?? 0) > 0);
  }, [userId, meId, isMe]);

  const loadPosts = useCallback(async () => {
    if (!meId) return;
    setPostsLoading(true);
    let ids: string[] | null = null;
    if (tab === "reposts") {
      const { data } = await supabase
        .from("post_reposts")
        .select("post_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      ids = (data ?? []).map((r) => r.post_id);
      if (ids.length === 0) {
        setPosts([]);
        setPostsLoading(false);
        return;
      }
    }
    let q = supabase.from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(50);
    q = ids ? q.in("id", ids) : q.eq("author_id", userId);
    const [res, mine] = await Promise.all([q, fetchMyReactions(meId)]);
    let rows = (res.data ?? []) as unknown as PostRow[];
    if (ids) {
      const order = new Map(ids.map((id, i) => [id, i]));
      rows = [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    setPosts(mapPosts(rows, mine.liked, mine.reposted));
    setPostsLoading(false);
  }, [userId, meId, tab]);

  useEffect(() => {
    loadHead();
  }, [loadHead]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const actions = usePostActions(meId, setPosts, loadPosts);

  async function toggleFollow() {
    if (!meId || isMe) return;
    const was = following;
    setFollowBusy(true);
    setFollowing(!was);
    setStats((s) => ({ ...s, followers: s.followers + (was ? -1 : 1) }));
    const res = was
      ? await supabase.from("follows").delete().eq("follower_id", meId).eq("following_id", userId)
      : await supabase.from("follows").insert({ follower_id: meId, following_id: userId });
    setFollowBusy(false);
    if (res.error) {
      setFollowing(was);
      setStats((s) => ({ ...s, followers: s.followers + (was ? 1 : -1) }));
    }
  }

  async function message() {
    setMsgBusy(true);
    const { data, error } = await supabase.rpc("create_direct_chat", { other_user: userId });
    setMsgBusy(false);
    if (!error && data) onMessage(data as string);
  }

  const name = profile?.display_name ?? "Профиль";
  const since = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    : null;

  const statItems: { label: string; value: number; onClick?: () => void }[] = [
    { label: "Посты", value: stats.posts },
    { label: "Подписчики", value: stats.followers, onClick: () => setList("followers") },
    { label: "Подписки", value: stats.following, onClick: () => setList("following") },
    { label: "Лайки", value: stats.likes },
    { label: "Репосты", value: stats.reposts },
  ];

  return (
    <div className="h-full w-full overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="max-w-2xl mx-auto w-full">
        <div className="sticky top-0 z-10 noir-glass border-b border-border flex items-center gap-3 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          {onClose && !embedded && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Назад"
              className="w-9 h-9 rounded-full flex items-center justify-center text-foreground hover:bg-surface-2 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <div className={`min-w-0 flex-1 ${embedded ? "pl-2" : ""}`}>
            <h2 className="font-display text-base font-semibold text-foreground truncate">{embedded ? "Профиль" : name}</h2>
            {profile && !embedded && <p className="text-xs text-muted-foreground">{countLabel(stats.posts)} постов</p>}
          </div>
          {embedded && isMe && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-pulse hover:bg-surface-2 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Изменить
            </motion.button>
          )}
        </div>

        {notFound ? (
          <p className="py-20 text-center text-muted-foreground text-sm">Профиль не найден</p>
        ) : !profile ? (
          <div className="anim-fade">
            <div className="skeleton h-36 sm:h-48 w-full" />
            <div className="px-5">
              <div className="skeleton -mt-11 h-20 w-20 rounded-full border-4 border-background" />
              <div className="skeleton mt-4 h-5 w-40 rounded-full" />
              <div className="skeleton mt-2 h-3.5 w-24 rounded-full" />
              <div className="skeleton mt-4 h-3.5 w-full rounded-full" />
              <div className="skeleton mt-2 h-3.5 w-2/3 rounded-full" />
            </div>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-b border-border pb-4"
            >
              <div
                className="relative h-36 sm:h-48 w-full overflow-hidden bg-surface-2"
                style={
                  profile.banner_url
                    ? undefined
                    : {
                        backgroundImage: `linear-gradient(135deg, oklch(0.5 0.12 ${nameHue(profile.display_name)}), oklch(0.32 0.09 ${(nameHue(profile.display_name) + 50) % 360}))`,
                      }
                }
              >
                {profile.banner_url && (
                  <img
                    src={profile.banner_url}
                    alt=""
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="px-5">
                <div className="-mt-11 flex items-end justify-between gap-3">
                  <div className="rounded-full bg-background p-1">
                    <UserAvatar name={profile.display_name} url={profile.avatar_url} size="w-20 h-20" className="text-xl" />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    {isMe ? (
                      !embedded && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          onClick={onEdit}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-2 border border-border text-sm font-semibold text-foreground hover:border-pulse/40 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Редактировать
                        </motion.button>
                      )
                    ) : (
                      <>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          onClick={message}
                          disabled={msgBusy}
                          aria-label="Написать"
                          className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-foreground hover:border-pulse/40 transition-colors disabled:opacity-60"
                        >
                          {msgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                        </motion.button>
                        <FollowButton following={following} busy={followBusy} onClick={toggleFollow} />
                      </>
                    )}
                  </div>
                </div>

                <h1 className="mt-3 font-display text-xl font-bold text-foreground break-words">{profile.display_name}</h1>
                <p className="text-sm text-pulse">@{profile.handle}</p>
                {profile.bio && (
                  <p className="selectable mt-2.5 text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line break-words">
                    <RichText text={profile.bio} />
                  </p>
                )}
                <TrackBadge url={profile.track_url} title={profile.track_title} artist={profile.track_artist} />
                {since && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />в Tosto с {since}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-5 gap-1 text-center">
                  {statItems.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      disabled={!s.onClick}
                      onClick={s.onClick}
                      className={`py-2 rounded-xl transition-colors ${s.onClick ? "hover:bg-surface-2" : "cursor-default"}`}
                    >
                      <span className="block text-base font-semibold text-foreground tabular-nums">
                        {countLabel(s.value)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            <div className="px-4"><MusicTastePanel userId={userId} /></div>

            <div className="flex border-b border-border">
              {([
                { id: "posts", label: "Посты" },
                { id: "reposts", label: "Репосты" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative flex-1 py-3 text-sm font-medium transition-colors ${
                    tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {tab === t.id && (
                    <motion.span
                      layoutId={`profile-tab-${tabLayoutId}`}
                      className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full bg-pulse shadow-pulse-glow"
                    />
                  )}
                </button>
              ))}
            </div>

            {postsLoading ? (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <p className="py-14 text-center text-muted-foreground text-sm px-6">
                {tab === "posts" ? "Постов пока нет" : "Репостов пока нет"}
              </p>
            ) : (
              <PostsView posts={posts} meId={meId} actions={actions} />
            )}
          </>
        )}
      </div>

      {list && <FollowList userId={userId} kind={list} onClose={() => setList(null)} />}
    </div>
  );
}

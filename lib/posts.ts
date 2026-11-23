import { useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playSound } from "@/lib/sounds";
import type { Post, Profile } from "@/types";

export const POST_SELECT =
  "id, author_id, body, created_at, profiles!author_id(id, display_name, handle, avatar_url), post_likes(count), post_comments(count), post_reposts(count)";

export type PostRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles: Profile | null;
  post_likes: { count: number }[] | null;
  post_comments: { count: number }[] | null;
  post_reposts: { count: number }[] | null;
};

/** Какие посты лайкнул и репостнул я (чтобы подсветить кнопки). */
export async function fetchMyReactions(meId: string) {
  const [likes, reposts] = await Promise.all([
    supabase.from("post_likes").select("post_id").eq("user_id", meId),
    supabase.from("post_reposts").select("post_id").eq("user_id", meId),
  ]);
  return {
    liked: new Set((likes.data ?? []).map((l) => l.post_id)),
    reposted: new Set((reposts.data ?? []).map((r) => r.post_id)),
  };
}

export function mapPosts(rows: PostRow[], liked: Set<string>, reposted: Set<string>): Post[] {
  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    body: r.body,
    created_at: r.created_at,
    author: r.profiles,
    like_count: r.post_likes?.[0]?.count ?? 0,
    comment_count: r.post_comments?.[0]?.count ?? 0,
    repost_count: r.post_reposts?.[0]?.count ?? 0,
    liked_by_me: liked.has(r.id),
    reposted_by_me: reposted.has(r.id),
  }));
}

/** Лайк, репост, удаление и счётчик комментариев: общие для ленты, профиля и поиска. */
export function usePostActions(
  meId: string,
  setPosts: Dispatch<SetStateAction<Post[]>>,
  reload: () => void,
) {
  const toggleLike = useCallback(
    async (post: Post) => {
      if (!meId) return;
      const was = post.liked_by_me;
      if (!was) playSound("like");
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, liked_by_me: !was, like_count: p.like_count + (was ? -1 : 1) } : p,
        ),
      );
      const res = was
        ? await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", meId)
        : await supabase.from("post_likes").insert({ post_id: post.id, user_id: meId });
      if (res.error) reload();
    },
    [meId, setPosts, reload],
  );

  const toggleRepost = useCallback(
    async (post: Post) => {
      if (!meId) return;
      const was = post.reposted_by_me;
      if (!was) playSound("post");
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, reposted_by_me: !was, repost_count: p.repost_count + (was ? -1 : 1) }
            : p,
        ),
      );
      const res = was
        ? await supabase.from("post_reposts").delete().eq("post_id", post.id).eq("user_id", meId)
        : await supabase.from("post_reposts").insert({ post_id: post.id, user_id: meId });
      if (res.error) reload();
    },
    [meId, setPosts, reload],
  );

  const deletePost = useCallback(
    async (post: Post) => {
      if (!window.confirm("Удалить пост?")) return;
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (!error) setPosts((prev) => prev.filter((p) => p.id !== post.id));
    },
    [setPosts],
  );

  const setCommentCount = useCallback(
    (postId: string, count: number) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId && p.comment_count !== count ? { ...p, comment_count: count } : p)),
      );
    },
    [setPosts],
  );

  return { toggleLike, toggleRepost, deletePost, setCommentCount };
}

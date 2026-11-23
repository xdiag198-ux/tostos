import type { Post } from "@/types";
import { PostCard } from "./Feed";

type Actions = {
  toggleLike: (p: Post) => void;
  toggleRepost: (p: Post) => void;
  deletePost: (p: Post) => void;
  setCommentCount: (postId: string, count: number) => void;
};

/** Список постов с теми же карточками, что и в ленте (лайки, репосты, комментарии). */
export function PostsView({ posts, meId, actions }: { posts: Post[]; meId: string; actions: Actions }) {
  return (
    <>
      {posts.map((p, i) => (
        <PostCard
          key={p.id}
          post={p}
          index={i}
          meId={meId}
          onLike={actions.toggleLike}
          onRepost={actions.toggleRepost}
          onDelete={actions.deletePost}
          onCommentCount={actions.setCommentCount}
        />
      ))}
    </>
  );
}

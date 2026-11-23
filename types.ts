export type Profile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio?: string | null;
  banner_url?: string | null;
  track_url?: string | null;
  track_title?: string | null;
  track_artist?: string | null;
  created_at?: string;
};

export type ChatType = "direct" | "group";

export type ChatRow = {
  id: string;
  type: ChatType;
  name: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string;
  last_message: string | null;
};

/** Чат вместе с участниками (профили), как его показывает UI. */
export type ChatItem = ChatRow & { members: Profile[] };

export type MessageKind = "text" | "image" | "file" | "voice";

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  kind?: MessageKind;
  media_path?: string | null;
  media_name?: string | null;
  media_mime?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
};

export type Post = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: Profile | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  repost_count: number;
  reposted_by_me: boolean;
};

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: Profile | null;
};

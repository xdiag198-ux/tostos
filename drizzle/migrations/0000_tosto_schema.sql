CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text NOT NULL,
  avatar text NOT NULL DEFAULT 'Я',
  color text NOT NULL DEFAULT 'from-zinc-700 to-zinc-900',
  body text NOT NULL,
  likes int NOT NULL DEFAULT 0,
  reposts int NOT NULL DEFAULT 0,
  comments int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO anon, authenticated;
GRANT ALL ON public.posts TO service_role;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_posts" ON public.posts;
CREATE POLICY "anon_select_posts" ON public.posts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_posts" ON public.posts;
CREATE POLICY "anon_insert_posts" ON public.posts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_posts" ON public.posts;
CREATE POLICY "anon_update_posts" ON public.posts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_posts" ON public.posts;
CREATE POLICY "anon_delete_posts" ON public.posts FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text NOT NULL DEFAULT '',
  avatar text NOT NULL DEFAULT 'Я',
  color text NOT NULL DEFAULT 'from-zinc-700 to-zinc-900',
  online boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO anon, authenticated;
GRANT ALL ON public.chats TO service_role;

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chats" ON public.chats;
CREATE POLICY "anon_select_chats" ON public.chats FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_chats" ON public.chats;
CREATE POLICY "anon_insert_chats" ON public.chats FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_chats" ON public.chats;
CREATE POLICY "anon_update_chats" ON public.chats FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_chats" ON public.chats;
CREATE POLICY "anon_delete_chats" ON public.chats FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  author text NOT NULL DEFAULT 'me',
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO anon, authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON public.messages;
CREATE POLICY "anon_select_messages" ON public.messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_messages" ON public.messages;
CREATE POLICY "anon_insert_messages" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_messages" ON public.messages;
CREATE POLICY "anon_update_messages" ON public.messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_messages" ON public.messages;
CREATE POLICY "anon_delete_messages" ON public.messages FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
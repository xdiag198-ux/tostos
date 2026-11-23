-- Tosto: пользователи, личные чаты, группы, посты, лайки, комментарии
-- ВНИМАНИЕ: удаляет старые таблицы posts / chats / messages вместе с данными.

DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;

-- ───────── Профили ─────────
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  handle text NOT NULL UNIQUE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Профиль создаётся автоматически при первом входе через Google
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  base text;
  new_handle text;
BEGIN
  base := lower(regexp_replace(split_part(coalesce(NEW.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  IF base = '' THEN base := 'user'; END IF;
  LOOP
    new_handle := base || '_' || substr(md5(random()::text), 1, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE handle = new_handle);
  END LOOP;

  INSERT INTO public.profiles (id, display_name, handle, avatar_url)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(coalesce(NEW.email, 'Пользователь'), '@', 1)),
    new_handle,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ───────── Чаты ─────────
CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('direct', 'group')),
  name text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message text
);

CREATE TABLE public.chat_members (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX idx_chat_members_user ON public.chat_members(user_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_chat ON public.messages(chat_id, created_at);

-- Обновляем last_message_at / last_message для списка чатов
CREATE OR REPLACE FUNCTION public.touch_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at, last_message = left(NEW.body, 200)
  WHERE id = NEW.chat_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_touch_chat AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat();

-- Хелперы для RLS (SECURITY DEFINER, чтобы не было рекурсии политик)
CREATE OR REPLACE FUNCTION public.is_chat_member(_chat_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = _chat_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_admin(_chat_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = _chat_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Создать (или найти существующий) личный чат
CREATE OR REPLACE FUNCTION public.create_direct_chat(other_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  cid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF other_user = me THEN RAISE EXCEPTION 'cannot chat with yourself'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_user) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  SELECT c.id INTO cid
  FROM public.chats c
  JOIN public.chat_members a ON a.chat_id = c.id AND a.user_id = me
  JOIN public.chat_members b ON b.chat_id = c.id AND b.user_id = other_user
  WHERE c.type = 'direct'
  LIMIT 1;

  IF cid IS NOT NULL THEN RETURN cid; END IF;

  INSERT INTO public.chats (type, created_by) VALUES ('direct', me) RETURNING id INTO cid;
  INSERT INTO public.chat_members (chat_id, user_id) VALUES (cid, me), (cid, other_user);
  RETURN cid;
END $$;

-- Создать группу
CREATE OR REPLACE FUNCTION public.create_group_chat(group_name text, member_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  cid uuid;
  uid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF group_name IS NULL OR char_length(trim(group_name)) = 0 THEN
    RAISE EXCEPTION 'group name required';
  END IF;

  INSERT INTO public.chats (type, name, created_by) VALUES ('group', trim(group_name), me) RETURNING id INTO cid;
  INSERT INTO public.chat_members (chat_id, user_id, role) VALUES (cid, me, 'admin');

  FOREACH uid IN ARRAY coalesce(member_ids, '{}') LOOP
    IF uid <> me AND EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
      INSERT INTO public.chat_members (chat_id, user_id) VALUES (cid, uid) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN cid;
END $$;

-- ───────── Посты, лайки, комментарии ─────────
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_created ON public.posts(created_at DESC);

CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post ON public.post_comments(post_id, created_at);

-- ───────── Права ─────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.chats TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_direct_chat(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_admin(uuid) TO authenticated;

-- ───────── RLS ─────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- profiles: все вошедшие видят всех (для поиска), правит каждый только себя
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- chats: видят только участники, имя группы меняет админ
CREATE POLICY chats_select ON public.chats FOR SELECT TO authenticated USING (public.is_chat_member(id));
CREATE POLICY chats_update_admin ON public.chats FOR UPDATE TO authenticated
  USING (type = 'group' AND public.is_chat_admin(id))
  WITH CHECK (type = 'group' AND public.is_chat_admin(id));

-- chat_members: видят участники того же чата; добавляет админ группы; выйти может каждый
CREATE POLICY members_select ON public.chat_members FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id));
CREATE POLICY members_insert_admin ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chat_admin(chat_id)
    AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.type = 'group')
  );
CREATE POLICY members_delete ON public.chat_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.type = 'group'))
    OR (public.is_chat_admin(chat_id) AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.type = 'group'))
  );

-- messages
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id));
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(chat_id));
CREATE POLICY messages_delete_own ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- posts / likes / comments: читают все вошедшие, пишет и удаляет каждый своё
CREATE POLICY posts_select ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY posts_update_own ON public.posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY posts_delete_own ON public.posts FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY likes_select ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY likes_insert ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY likes_delete_own ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY comments_select ON public.post_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY comments_insert ON public.post_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY comments_delete_own ON public.post_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ───────── Realtime ─────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;

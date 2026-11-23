-- Подписки, репосты, статистика профиля. Выполнить один раз: Supabase → SQL Editor → вставить → Run.
-- Данные не удаляются, повторный запуск безопасен.

-- 1. Подписки
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- 2. Репосты
CREATE TABLE IF NOT EXISTS public.post_reposts (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reposts_user ON public.post_reposts(user_id, created_at DESC);

-- 3. Права и RLS
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_reposts TO authenticated;
GRANT ALL ON public.follows, public.post_reposts TO service_role;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follows_select ON public.follows;
DROP POLICY IF EXISTS follows_insert_own ON public.follows;
DROP POLICY IF EXISTS follows_delete_own ON public.follows;
CREATE POLICY follows_select ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY follows_insert_own ON public.follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete_own ON public.follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

DROP POLICY IF EXISTS reposts_select ON public.post_reposts;
DROP POLICY IF EXISTS reposts_insert_own ON public.post_reposts;
DROP POLICY IF EXISTS reposts_delete_own ON public.post_reposts;
CREATE POLICY reposts_select ON public.post_reposts FOR SELECT TO authenticated USING (true);
CREATE POLICY reposts_insert_own ON public.post_reposts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY reposts_delete_own ON public.post_reposts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Статистика профиля одним запросом
CREATE OR REPLACE FUNCTION public.profile_stats(uid uuid)
RETURNS TABLE (posts bigint, followers bigint, following bigint, likes bigint, reposts bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT
    (SELECT count(*) FROM public.posts WHERE author_id = uid),
    (SELECT count(*) FROM public.follows WHERE following_id = uid),
    (SELECT count(*) FROM public.follows WHERE follower_id = uid),
    (SELECT count(*) FROM public.post_likes l JOIN public.posts p ON p.id = l.post_id WHERE p.author_id = uid),
    (SELECT count(*) FROM public.post_reposts r JOIN public.posts p ON p.id = r.post_id WHERE p.author_id = uid);
$$;
REVOKE EXECUTE ON FUNCTION public.profile_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_stats(uuid) TO authenticated;

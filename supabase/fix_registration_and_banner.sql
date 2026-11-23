-- Tosto: починка регистрации + GIF-баннер профиля.
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Данные не удаляются, повторный запуск безопасен.
--
-- Что чинит:
--  1. Триггер handle_new_user падал на длинных email («ivanivanovich1990@…» → ник длиннее 20 символов
--     нарушал CHECK profiles_handle_format) → Supabase отвечал «Database error saving new user»
--     и пользователь не мог зарегистрироваться. Теперь ник всегда 3–20 символов, а при любой ошибке
--     триггер подставляет запасной ник и НЕ блокирует создание аккаунта.
--  2. Добавляет все колонки профиля (bio, трек, баннер): если не выполнены старые *_update.sql,
--     запрос профиля падал, и приложение вечно крутило загрузку.
--  3. Создаёт недостающие профили для уже зарегистрированных пользователей без профиля.
--  4. Разрешает пользователю создать СВОЙ профиль из приложения (самовосстановление).
--  5. Бакет banners для GIF/PNG/JPG/WebP баннеров (до 8 МБ).

-- ───────── 1. Колонки профиля ─────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_artist text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_banner_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_banner_len
  CHECK (banner_url IS NULL OR char_length(banner_url) <= 500);

-- ───────── 2. Надёжный триггер создания профиля ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  base text;
  new_handle text;
  shown_name text;
  tries int := 0;
BEGIN
  -- до 12 символов основы + «_» + 4 случайных = максимум 17, всегда влезает в лимит 20
  base := lower(regexp_replace(split_part(coalesce(NEW.email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  base := left(base, 12);
  IF char_length(base) < 3 THEN base := 'user'; END IF;

  LOOP
    new_handle := base || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE handle = new_handle);
    tries := tries + 1;
    IF tries > 20 THEN
      new_handle := 'u' || substr(replace(NEW.id::text, '-', ''), 1, 15);
      EXIT;
    END IF;
  END LOOP;

  shown_name := left(coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Пользователь'
  ), 40);

  INSERT INTO public.profiles (id, display_name, handle, avatar_url)
  VALUES (NEW.id, shown_name, new_handle, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Что бы ни случилось, вход не блокируем: приложение создаст профиль само при первом запуске.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ───────── 3. Профили для тех, кто уже пытался зарегистрироваться ─────────
INSERT INTO public.profiles (id, display_name, handle, avatar_url)
SELECT
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
                nullif(trim(u.raw_user_meta_data->>'name'), ''),
                nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                'Пользователь'), 40),
  'u' || substr(replace(u.id::text, '-', ''), 1, 15),
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT DO NOTHING;

-- ───────── 4. Пользователь может создать только свой профиль ─────────
GRANT INSERT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ───────── 5. Баннеры (GIF поддерживаются) ─────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banners', 'banners', true, 8388608, ARRAY['image/gif','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/gif','image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS banners_read ON storage.objects;
DROP POLICY IF EXISTS banners_insert_own ON storage.objects;
DROP POLICY IF EXISTS banners_update_own ON storage.objects;
DROP POLICY IF EXISTS banners_delete_own ON storage.objects;

CREATE POLICY banners_read ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');
CREATE POLICY banners_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY banners_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY banners_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

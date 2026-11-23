-- Редактор профиля: поле «О себе», проверка юзернейма, хранилище аватарок.
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Данные не удаляются.

-- 1. Поле «О себе»
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_len CHECK (bio IS NULL OR char_length(bio) <= 160);

-- 2. Формат юзернейма (NOT VALID: старые записи не проверяются, новые и изменённые - да)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_handle_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_format
  CHECK (handle ~ '^[a-z0-9_]{3,20}$') NOT VALID;

-- 3. Бакет для аватарок (публичный на чтение)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- 4. Политики: каждый работает только в своей папке avatars/<user_id>/
DROP POLICY IF EXISTS avatars_read ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

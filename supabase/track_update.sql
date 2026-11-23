-- Трек в профиле: ссылка, название и артист.
-- Выполнить один раз: Supabase → SQL Editor → вставить → Run. Данные не удаляются.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS track_artist text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_track_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_track_len CHECK (
  (track_url IS NULL OR char_length(track_url) <= 500)
  AND (track_title IS NULL OR char_length(track_title) <= 80)
  AND (track_artist IS NULL OR char_length(track_artist) <= 80)
);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_track_url_https;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_track_url_https CHECK (
  track_url IS NULL OR track_url ~* '^https://'
);

-- Фото, файлы и голосовые в чатах. Выполнить один раз: Supabase → SQL Editor → вставить → Run.
-- Данные не удаляются, повторный запуск безопасен.

-- 1. Поля вложений в сообщениях
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_path text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_name text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_mime text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_size integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_duration integer;

ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_len;
ALTER TABLE public.messages ADD CONSTRAINT messages_body_len CHECK (char_length(body) <= 4000);
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'image', 'file', 'voice'));
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_check
  CHECK ((kind = 'text' AND char_length(body) >= 1) OR (kind <> 'text' AND media_path IS NOT NULL));

-- 2. В списке чатов вместо текста показываем «Фото», «Файл», «Голосовое»
CREATE OR REPLACE FUNCTION public.touch_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at,
      last_message = CASE NEW.kind
        WHEN 'image' THEN 'Фото'
        WHEN 'voice' THEN 'Голосовое сообщение'
        WHEN 'file' THEN 'Файл: ' || left(coalesce(NEW.media_name, ''), 60)
        ELSE left(NEW.body, 200)
      END
  WHERE id = NEW.chat_id;
  RETURN NEW;
END $$;

-- 3. Приватное хранилище вложений (до 25 МБ на файл)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

-- Файлы лежат в папке <chat_id>/..., читать и загружать могут только участники этого чата
DROP POLICY IF EXISTS chat_media_read ON storage.objects;
DROP POLICY IF EXISTS chat_media_insert ON storage.objects;

CREATE POLICY chat_media_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         THEN public.is_chat_member(((storage.foldername(name))[1])::uuid) ELSE false END
  );

CREATE POLICY chat_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         THEN public.is_chat_member(((storage.foldername(name))[1])::uuid) ELSE false END
  );

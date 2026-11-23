-- Пуш-уведомления: таблица токенов устройств. Выполнить один раз в Supabase → SQL Editor → Run.
-- Данные не удаляются, повторный запуск безопасен.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

-- Напрямую в таблицу писать нельзя: только через функции ниже и сервисный ключ (Edge Function).
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_device_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.device_tokens (token, user_id, platform, updated_at)
  VALUES (p_token, auth.uid(), p_platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_device_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.device_tokens WHERE token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_device_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device_token(text) TO authenticated;

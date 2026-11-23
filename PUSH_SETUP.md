# Пуш-уведомления Tosto: настройка по шагам

Код уже в проекте. Нужно один раз настроить Firebase и Supabase.

## 1. Firebase (бесплатно)
1. Открой console.firebase.google.com → Add project (Создать проект), имя `Tosto`, аналитику можно выключить.
2. В проекте: значок Android (Add app) → Android package name: `com.tosto.app` → Register app.
3. Скачай `google-services.json`. Остальные шаги мастера пропусти.
4. Загрузи этот файл в КОРЕНЬ репозитория на GitHub (Add file → Upload files), имя ровно `google-services.json`.
5. Шестерёнка → Project settings → вкладка Service accounts → Generate new private key → скачается JSON-файл. Это секретный ключ: в репозиторий его НЕ загружай и никому не пересылай.

## 2. Supabase: база
SQL Editor → New query → вставь `supabase/push_setup.sql` → Run.

## 3. Supabase: функция
1. Edge Functions → Deploy a new function → Via Editor.
2. Имя: `send-push`. Вставь код из `supabase/functions/send-push/index.ts` → Deploy.

## 4. Supabase: секреты функции
Edge Functions → Secrets (или Project Settings → Edge Functions → Secrets) → добавь два:
- `FIREBASE_SERVICE_ACCOUNT` — весь текст JSON-файла из шага 1.5 (открой в блокноте, скопируй всё).
- `PUSH_WEBHOOK_SECRET` — любая длинная случайная строка (например, 30 символов из букв и цифр). Запомни её.

## 5. Supabase: вебхук
Database → Webhooks → Create a new hook:
- Name: `send_push_on_message`
- Table: `messages`, событие: Insert
- Type: Supabase Edge Functions, функция `send-push`
- HTTP Headers: добавь заголовок `x-webhook-secret` со значением из `PUSH_WEBHOOK_SECRET`.
- Create webhook.

## 6. Сборка
Залей обновлённые файлы проекта на GitHub и запусти Build Android APK. В логе шага «Создание Android-проекта» должна быть строка «google-services.json подключён». Установи новый APK, при первом запуске разреши уведомления.

## 7. Проверка
Войди двумя аккаунтами на двух устройствах. Сверни приложение на одном и напиши ему с другого: должен прийти пуш. Если приложение открыто, пуш не показывается, играет звук внутри приложения.

## Если не приходит
- Supabase → Edge Functions → send-push → Logs: там видно, вызвалась ли функция и что ответил Firebase.
- Таблица `device_tokens` должна содержать токен устройства (Table Editor).
- На Xiaomi, Oppo, Realme и подобных: Настройки → Приложения → Tosto → Батарея → «Без ограничений» и разреши автозапуск, иначе система убивает приложение и пуши не доходят.

# Android-приложение Tosto (APK через GitHub)

Приложение собирается в GitHub Actions: сайт упаковывается в оболочку Capacitor, на выходе файл `tosto.apk`.
Supabase, таблицы и Realtime остаются теми же.

## Один раз настроить

1. **Репозиторий.** Залейте проект на GitHub. Файл `.env` в репозиторий попадать не должен
   (он уже в `.gitignore`). Если `.env` когда-то был закоммичен, удалите его из репозитория.
2. **Секреты GitHub.** Репозиторий → Settings → Secrets and variables → Actions → New repository secret.
   Добавьте три секрета (значения без кавычек):
   - `SUPABASE_URL` — Project URL вида `https://xxxx.supabase.co` (без `/rest/v1/` и без слеша на конце)
   - `SUPABASE_PUBLISHABLE_KEY` — ключ `sb_publishable_...`
   - `SUPABASE_PROJECT_ID` — Project ID
3. **Supabase.** Authentication → URL Configuration → Redirect URLs → Add URL:
   `com.tosto.app://auth-callback` — и сохранить. Без этого после входа через Google приложение не откроется.
4. **Google Cloud менять не нужно.** Redirect URI там остаётся `https://<project-ref>.supabase.co/auth/v1/callback`.
   Но чтобы входили все, в Audience нажмите Publish app (если ещё не сделали).

## Собрать APK

GitHub → вкладка **Actions** → **Build Android APK** → **Run workflow**.
Через 5–10 минут внизу страницы запуска появится артефакт `tosto-apk`. Скачайте архив, внутри `tosto.apk`.
Установка на телефон: перекиньте файл и разрешите установку из неизвестных источников.
Сборка также запускается сама при каждом push в ветку `main` или `master`.

## Постоянная подпись (чтобы приложение можно было обновлять)

Без ключа собирается debug-APK. Он работает, но при каждой сборке подписывается новым ключом,
поэтому поверх старой версии не установится: придётся сначала удалить старую.
Чтобы обновления ставились поверх, создайте ключ один раз:

```sh
keytool -genkeypair -v -keystore tosto.jks -alias tosto -keyalg RSA -keysize 2048 -validity 10000
base64 -i tosto.jks | tr -d '\n'     # Mac; на Linux: base64 -w0 tosto.jks
```

Добавьте четыре секрета в GitHub:
- `ANDROID_KEYSTORE_BASE64` — вывод второй команды
- `ANDROID_KEYSTORE_PASSWORD` — пароль от хранилища
- `ANDROID_KEY_ALIAS` — `tosto`
- `ANDROID_KEY_PASSWORD` — пароль ключа

Файл `tosto.jks` и пароли сохраните в надёжном месте и не заливайте в репозиторий.
Потеряете ключ, и обновить приложение будет нельзя.

## Как устроен вход через Google в приложении

Google запрещает вход внутри встроенного окна приложения, поэтому кнопка «Войти через Google» открывает
системный браузер. После входа Supabase возвращает пользователя на `com.tosto.app://auth-callback`,
Android открывает приложение, и код в `src/lib/auth.tsx` завершает вход.
Нужную запись в `AndroidManifest.xml` добавляет `scripts/patch-android.mjs` при сборке.

## Если сборка упала

- **Проверка секретов.** Не заданы `SUPABASE_URL` или `SUPABASE_PUBLISHABLE_KEY`.
- **Сборка сайта (SPA).** Пришлите текст ошибки из лога. Скрипт `prepare-mobile.mjs` при проблеме
  выводит список файлов в `dist/client`.
- **Сборка APK.** Пришлите последние ~50 строк лога шага «Сборка APK».
- **Иконка и заставка.** Шаг необязательный: при ошибке сборка продолжится со стандартной иконкой.

Другое имя или id приложения: поменяйте `appId` и `appName` в `capacitor.config.json`,
`com.tosto.app` в `scripts/patch-android.mjs` и `NATIVE_REDIRECT` в `src/lib/auth.tsx`,
а также Redirect URL в Supabase. После выхода в Google Play id менять нельзя.

## Локальная проверка (по желанию)

Нужны Node 22, Java 21 и Android SDK. Положите ключи в `.env`, затем:

```sh
npm install
npm run build:mobile
npx cap add android && node scripts/patch-android.mjs
npx cap sync android
cd android && ./gradlew assembleDebug
```

// Добавляет в AndroidManifest.xml ссылку com.tosto.app://auth-callback,
// чтобы после входа через Google браузер возвращал пользователя в приложение.
import fs from "node:fs";

const file = "android/app/src/main/AndroidManifest.xml";
if (!fs.existsSync(file)) {
  console.error(`Нет файла ${file}. Сначала выполните: npx cap add android`);
  process.exit(1);
}

let xml = fs.readFileSync(file, "utf8");

// Разрешение на уведомления (Android 13+).
if (!xml.includes("android.permission.POST_NOTIFICATIONS")) {
  xml = xml.replace(
    "</manifest>",
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>',
  );
  fs.writeFileSync(file, xml);
  console.log("Добавлено разрешение POST_NOTIFICATIONS.");
}

// Запись голосовых сообщений (микрофон).
for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"]) {
  if (!xml.includes(perm)) {
    xml = xml.replace("</manifest>", `    <uses-permission android:name="${perm}" />\n</manifest>`);
    fs.writeFileSync(file, xml);
    console.log(`Добавлено разрешение ${perm}.`);
  }
}

// Клавиатура: окно сжимается, и поле ввода остаётся над клавиатурой, как в Telegram.
if (!/android:windowSoftInputMode=/.test(xml)) {
  xml = xml.replace(/<activity\b/, '<activity android:windowSoftInputMode="adjustResize"');
  fs.writeFileSync(file, xml);
  console.log("Добавлен windowSoftInputMode=adjustResize.");
}

// Строка состояния и панель навигации в цвет приложения, без белой полосы при запуске.
const stylesFile = "android/app/src/main/res/values/styles.xml";
if (fs.existsSync(stylesFile)) {
  let styles = fs.readFileSync(stylesFile, "utf8");
  if (!styles.includes("tosto-bars")) {
    const items =
      '\n        <!-- tosto-bars -->' +
      '\n        <item name="android:statusBarColor">#0A0A0A</item>' +
      '\n        <item name="android:navigationBarColor">#0A0A0A</item>' +
      '\n        <item name="android:windowBackground">#0A0A0A</item>' +
      '\n        <item name="android:windowLightStatusBar">false</item>' +
      '\n        <item name="android:windowLightNavigationBar">false</item>';
    const patched = styles.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, `$1${items}`);
    if (patched !== styles) {
      fs.writeFileSync(stylesFile, patched);
      console.log("Цвета строки состояния и панели навигации обновлены.");
    }
  }
}

if (xml.includes('android:scheme="com.tosto.app"')) {
  console.log("Intent-filter уже добавлен, пропускаю.");
  process.exit(0);
}

const filter = `
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="com.tosto.app" android:host="auth-callback" />
        </intent-filter>
`;

if (!xml.includes("</activity>")) {
  console.error("В AndroidManifest.xml не найден тег </activity>.");
  process.exit(1);
}

xml = xml.replace("</activity>", `${filter}    </activity>`);

if (!/android:launchMode="singleTask"/.test(xml)) {
  xml = xml.replace(/<activity\b/, '<activity android:launchMode="singleTask"');
}

fs.writeFileSync(file, xml);
console.log("AndroidManifest.xml обновлён.");

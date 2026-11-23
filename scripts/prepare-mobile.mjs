// После `vite build --config vite.config.mobile.ts` кладёт точку входа SPA в dist/client/index.html,
// потому что Capacitor ожидает именно index.html.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("dist/client");

function list(d, depth = 0) {
  if (!fs.existsSync(d) || depth > 1) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? [`${e.name}/`, ...list(path.join(d, e.name), depth + 1).map((x) => `${e.name}/${x}`)] : [e.name],
  );
}

if (!fs.existsSync(dir)) {
  console.error("Нет папки dist/client: сборка vite.config.mobile.ts не создала файлы.");
  process.exit(1);
}

const index = path.join(dir, "index.html");
if (!fs.existsSync(index)) {
  const candidates = ["_shell.html", "shell.html", "_shell/index.html"];
  const found = candidates.map((c) => path.join(dir, c)).find((p) => fs.existsSync(p));
  if (!found) {
    console.error("Не найден HTML-файл SPA (_shell.html или index.html). Содержимое dist/client:");
    console.error(list(dir).join("\n"));
    process.exit(1);
  }
  fs.copyFileSync(found, index);
  console.log(`Скопировано ${path.relative(dir, found)} -> index.html`);
}
console.log("Готово: dist/client/index.html на месте.");

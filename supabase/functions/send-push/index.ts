// Edge Function: отправляет пуш получателям нового сообщения через Firebase Cloud Messaging (HTTP v1).
// Вызывается Database Webhook на INSERT в таблицу messages.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "{}");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: SERVICE_ACCOUNT.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = String(SERVICE_ACCOUNT.private_key)
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Не удалось получить токен Google: " + JSON.stringify(json));
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let payload: { type?: string; record?: { chat_id: string; sender_id: string; body: string; kind?: string; media_name?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const msg = payload.record;
  if (payload.type !== "INSERT" || !msg) return new Response("ignored");

  const [{ data: chat }, { data: sender }, { data: members }] = await Promise.all([
    admin.from("chats").select("type, name").eq("id", msg.chat_id).single(),
    admin.from("profiles").select("display_name").eq("id", msg.sender_id).single(),
    admin.from("chat_members").select("user_id").eq("chat_id", msg.chat_id).neq("user_id", msg.sender_id),
  ]);
  const recipients = (members ?? []).map((m) => m.user_id);
  if (!recipients.length) return new Response("no recipients");

  const { data: tokens } = await admin.from("device_tokens").select("token").in("user_id", recipients);
  if (!tokens?.length) return new Response("no tokens");

  const senderName = sender?.display_name ?? "Новое сообщение";
  const isGroup = chat?.type === "group";
  const title = isGroup ? (chat?.name ?? "Группа") : senderName;
  const raw =
    msg.kind === "image"
      ? "Фото"
      : msg.kind === "voice"
        ? "Голосовое сообщение"
        : msg.kind === "file"
          ? `Файл: ${msg.media_name ?? ""}`
          : (msg.body ?? "");
  const text = raw.length > 120 ? raw.slice(0, 117) + "…" : raw;
  const body = isGroup ? `${senderName}: ${text}` : text;

  const bearer = await accessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`;

  const results = await Promise.all(
    tokens.map(async ({ token }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { chat_id: msg.chat_id },
            android: { priority: "HIGH", notification: { tag: msg.chat_id } },
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        // Токен устарел (приложение удалено): убираем из базы.
        if (res.status === 404 || err.includes("UNREGISTERED")) {
          await admin.from("device_tokens").delete().eq("token", token);
        } else {
          console.error("FCM error", res.status, err);
        }
      }
      return res.ok;
    }),
  );

  return new Response(JSON.stringify({ sent: results.filter(Boolean).length, total: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

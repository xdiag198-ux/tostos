import { memo, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfileViewer } from "@/lib/profileView";
import { haptic } from "@/lib/haptics";

/** handle (в нижнем регистре) → id профиля или null, если такого пользователя нет. */
const handleCache = new Map<string, string | null>();

/** Находит id пользователя по @нику. Результат кешируется. */
export async function resolveHandle(handle: string): Promise<string | null> {
  const h = handle.toLowerCase();
  if (handleCache.has(h)) return handleCache.get(h) ?? null;
  const { data, error } = await supabase.from("profiles").select("id").eq("handle", h).maybeSingle();
  if (error) return null; // сетевую ошибку не кешируем
  const id = (data as { id: string } | null)?.id ?? null;
  handleCache.set(h, id);
  return id;
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "mention"; value: string; handle: string }
  | { kind: "link"; value: string; href: string };

const TOKEN_RE = /(https?:\/\/[^\s<>]+)|@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;
const WORD_CHAR = /[A-Za-z0-9_@/.]/;
const TRAILING_PUNCT = /[.,;:!?)\]}"'»]+$/;

/** Разбивает текст на обычный текст, @упоминания и ссылки. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    if (m[1]) {
      const trimmed = raw.replace(TRAILING_PUNCT, "");
      raw = trimmed || raw;
    } else {
      // @ внутри слова (почта name@site) не считаем упоминанием
      const prev = start > 0 ? text[start - 1] : "";
      if (prev && WORD_CHAR.test(prev)) continue;
    }
    if (start > last) out.push({ kind: "text", value: text.slice(last, start) });
    if (m[1]) out.push({ kind: "link", value: raw, href: raw });
    else out.push({ kind: "mention", value: raw, handle: m[2] });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

function Mention({ handle, label }: { handle: string; label: string }) {
  const { openProfile } = useProfileViewer();
  const [state, setState] = useState<"idle" | "loading" | "missing">("idle");

  if (state === "missing") return <>{label}</>;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        if (state === "loading") return;
        haptic("light");
        setState("loading");
        const id = await resolveHandle(handle);
        if (id) {
          setState("idle");
          openProfile(id);
        } else {
          setState("missing");
        }
      }}
      className={`inline cursor-pointer text-pulse font-medium hover:underline active:opacity-70 ${state === "loading" ? "opacity-60" : ""}`}
    >
      {label}
    </button>
  );
}

/** Текст с кликабельными @юзернеймами (открывают профиль) и ссылками. */
export const RichText = memo(function RichText({ text, className = "" }: { text: string; className?: string }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const nodes: ReactNode[] = tokens.map((t, i) => {
    if (t.kind === "mention") return <Mention key={i} handle={t.handle} label={t.value} />;
    if (t.kind === "link") {
      return (
        <a
          key={i}
          href={t.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          className="text-pulse hover:underline break-all"
        >
          {t.value}
        </a>
      );
    }
    return <span key={i}>{t.value}</span>;
  });
  return <span className={className}>{nodes}</span>;
});

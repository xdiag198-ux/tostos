import { haptic } from "@/lib/haptics";
import { useBackHandler } from "@/lib/backStack";
import { motion, AnimatePresence } from "framer-motion";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  PenSquare,
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  FileText,
  Loader2,
  Plus,
  X,
  ArrowLeft,
  LogOut,
  Users,
  Check,
  User as UserIcon,
} from "lucide-react";
import type { ChatItem, ChatRow, Message, Profile } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sounds";
import { MAX_FILE_BYTES, compressImage, formatSize, previewOf, uploadChatMedia } from "@/lib/media";
import { MessageMedia } from "./MessageMedia";
import { VoiceRecorderBar } from "./VoiceRecorderBar";
import { UserAvatar, nameHue } from "./UserAvatar";
import { useEdgeSwipeBack } from "@/lib/swipeBack";
import { addUnread, clearUnread, useUnreadCounts } from "@/lib/unread";
import { useProfileViewer } from "@/lib/profileView";

function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function chatTitle(chat: ChatItem, meId: string) {
  if (chat.type === "group") return chat.name || "Группа";
  const other = chat.members.find((m) => m.id !== meId);
  return other?.display_name ?? "Собеседник";
}

function chatAvatarUrl(chat: ChatItem, meId: string) {
  if (chat.type === "group") return null;
  return chat.members.find((m) => m.id !== meId)?.avatar_url ?? null;
}

type MembershipRow = {
  chat_id: string;
  profiles: Profile | null;
};

/* ───────────── Окно «Новый чат / Новая группа» ───────────── */

function NewChatModal({
  open,
  meId,
  onClose,
  onCreated,
}: {
  open: boolean;
  meId: string;
  onClose: () => void;
  onCreated: (chatId: string) => void;
}) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMode("direct");
      setQuery("");
      setSelected([]);
      setGroupName("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim().replace(/^@+/, "").replace(/[%,()*\\]/g, "").trim();
    const timer = setTimeout(async () => {
      setSearching(true);
      let req = supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url")
        .neq("id", meId)
        .order("display_name")
        .limit(20);
      if (q) req = req.or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`);
      const { data, error: searchError } = await req;
      if (searchError) setError("Не удалось выполнить поиск: " + searchError.message);
      setResults((data ?? []) as Profile[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, meId]);

  async function openDirect(user: Profile) {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_direct_chat", {
      other_user: user.id,
    });
    setBusy(false);
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Не удалось создать чат");
      return;
    }
    onCreated(data as string);
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length === 0) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_group_chat", {
      group_name: groupName.trim(),
      member_ids: selected.map((u) => u.id),
    });
    setBusy(false);
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Не удалось создать группу");
      return;
    }
    onCreated(data as string);
  }

  function toggle(user: Profile) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm max-h-[85vh] flex flex-col rounded-2xl bg-surface-1 border border-border shadow-noir p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-foreground">Новый чат</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-background border border-border mb-3">
              {(["direct", "group"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    mode === m
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "direct" ? <UserIcon className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  {m === "direct" ? "Личный" : "Группа"}
                </button>
              ))}
            </div>

            {mode === "group" && (
              <>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value.slice(0, 60))}
                  placeholder="Название группы"
                  className="w-full mb-3 px-4 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
                />
                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selected.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(u)}
                        className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-foreground"
                      >
                        {u.display_name}
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="relative group mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-pulse transition-colors" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти по имени или @нику"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pulse/50 focus:ring-2 focus:ring-pulse/15 transition"
              />
            </div>

            <div className="flex-1 min-h-[120px] overflow-y-auto -mx-1 px-1 space-y-1">
              {searching && results.length === 0 ? (
                <div className="flex justify-center py-6 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : results.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">Никого не найдено</p>
              ) : (
                results.map((u) => {
                  const picked = selected.some((s) => s.id === u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={busy}
                      onClick={() => (mode === "direct" ? openDirect(u) : toggle(u))}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2 transition-colors text-left disabled:opacity-50"
                    >
                      <UserAvatar name={u.display_name} url={u.avatar_url} size="w-9 h-9" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">@{u.handle}</p>
                      </div>
                      {mode === "group" && picked && <Check className="w-4 h-4 text-pulse" />}
                    </button>
                  );
                })
              )}
            </div>

            {mode === "group" && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={createGroup}
                disabled={busy || !groupName.trim() || selected.length === 0}
                className="w-full mt-3 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-35 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Создать группу
              </motion.button>
            )}
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


const PAGE = 60;

function dayDiff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(now) - start(d)) / 86400000);
}

function dayLabel(iso: string) {
  const diff = dayDiff(iso);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

/** Время в списке чатов как в Telegram: сегодня часы, на неделе день недели, раньше дата. */
function listTime(iso: string) {
  const diff = dayDiff(iso);
  if (diff <= 0) return msgTime(iso);
  const d = new Date(iso);
  if (diff < 7) {
    const w = d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/* ───────────── Строка списка чатов (как в Telegram) ───────────── */

const ChatListRow = memo(function ChatListRow({
  chat,
  meId,
  active,
  unread,
  onOpen,
}: {
  chat: ChatItem;
  meId: string;
  active: boolean;
  unread: number;
  onOpen: (id: string) => void;
}) {
  const title = chatTitle(chat, meId);
  return (
    <button
      type="button"
      onClick={() => onOpen(chat.id)}
      className={`tap w-full flex items-center gap-3 pl-4 h-[72px] text-left ${
        active ? "sm:bg-surface-2" : ""
      }`}
    >
      <UserAvatar name={title} url={chatAvatarUrl(chat, meId)} size="w-[54px] h-[54px]" className="text-base" />
      <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center pr-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 flex items-center gap-1.5 font-semibold text-[16px] text-foreground">
            {chat.type === "group" && <Users className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="truncate">{title}</span>
          </span>
          {chat.last_message && (
            <span className={`text-[12px] shrink-0 tabular-nums ${unread ? "text-pulse" : "text-muted-foreground"}`}>
              {listTime(chat.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex-1 min-w-0 truncate text-[14px] text-muted-foreground">
            {chat.last_message ?? "Нет сообщений"}
          </span>
          {unread > 0 && (
            <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-pulse text-primary-foreground text-[12px] font-semibold flex items-center justify-center tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

function ChatListSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 pl-4 h-[72px] animate-pulse">
          <div className="w-[54px] h-[54px] rounded-full bg-surface-2" />
          <div className="flex-1 pr-4 space-y-2">
            <div className="h-3.5 rounded bg-surface-2" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
            <div className="h-3 rounded bg-surface-1" style={{ width: `${55 + ((i * 23) % 35)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Сообщение ───────────── */

type BubbleProps = {
  m: Message;
  mine: boolean;
  isGroup: boolean;
  sender?: Profile;
  first: boolean;
  last: boolean;
  fresh: boolean;
};

const Bubble = memo(function Bubble({ m, mine, isGroup, sender, first, last, fresh }: BubbleProps) {
  const isText = !m.kind || m.kind === "text";
  const pending = m.id.startsWith("tmp-");
  const senderName = sender?.display_name ?? "Участник";
  return (
    <div
      className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"} ${
        fresh ? "anim-pop-in" : ""
      }`}
      style={fresh ? { transformOrigin: mine ? "100% 100%" : "0% 100%" } : undefined}
    >
      {!mine && isGroup &&
        (last ? <UserAvatar name={senderName} url={sender?.avatar_url} size="w-8 h-8" /> : <div className="w-8 shrink-0" />)}
      <div
        className={`relative max-w-[80%] sm:max-w-[70%] px-3 py-1.5 rounded-[18px] text-[15px] leading-[1.35] ${
          mine
            ? `bg-primary text-primary-foreground ${last ? "rounded-br-[5px]" : ""}`
            : `bg-surface-2 text-foreground ${last ? "rounded-bl-[5px]" : ""}`
        } ${pending ? "opacity-70" : ""}`}
      >
        {!mine && isGroup && first && (
          <p className="text-[13px] font-semibold mb-0.5 truncate" style={{ color: `oklch(0.78 0.13 ${nameHue(senderName)})` }}>
            {senderName}
          </p>
        )}
        {isText ? (
          <>
            <p className="selectable whitespace-pre-line break-words">
              {m.body}
              <span className="inline-block w-[50px]" aria-hidden="true" />
            </p>
            <span
              className={`absolute right-2.5 bottom-1 text-[11px] tabular-nums ${
                mine ? "text-primary-foreground/55" : "text-muted-foreground"
              }`}
            >
              {msgTime(m.created_at)}
            </span>
          </>
        ) : (
          <>
            <MessageMedia m={m} mine={mine} />
            <div
              className={`flex justify-end mt-1 text-[11px] tabular-nums ${
                mine ? "text-primary-foreground/55" : "text-muted-foreground"
              }`}
            >
              {msgTime(m.created_at)}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

type Row = { type: "day"; key: string; label: string } | { type: "msg"; m: Message; first: boolean; last: boolean };

function buildRows(list: Message[]): Row[] {
  const out: Row[] = [];
  const GAP = 5 * 60 * 1000;
  let prevDay = "";
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const t = new Date(m.created_at).getTime();
    const day = new Date(t).toDateString();
    if (day !== prevDay) {
      out.push({ type: "day", key: "d" + m.id, label: dayLabel(m.created_at) });
      prevDay = day;
    }
    const prev = list[i - 1];
    const next = list[i + 1];
    const joinsPrev =
      !!prev &&
      prev.sender_id === m.sender_id &&
      new Date(prev.created_at).toDateString() === day &&
      t - new Date(prev.created_at).getTime() < GAP;
    const joinsNext =
      !!next &&
      next.sender_id === m.sender_id &&
      new Date(next.created_at).toDateString() === day &&
      new Date(next.created_at).getTime() - t < GAP;
    out.push({ type: "msg", m, first: !joinsPrev, last: !joinsNext });
  }
  return out;
}

/* ───────────── Основной экран ───────────── */

export function Chats({
  onConversationChange,
  openChatId,
  onOpenedChat,
  visible = true,
}: {
  onConversationChange?: (open: boolean) => void;
  openChatId?: string | null;
  onOpenedChat?: () => void;
  /** Вкладка «Чаты» сейчас на экране. Экран остаётся смонтированным, чтобы чаты не перезагружались. */
  visible?: boolean;
} = {}) {
  const { user } = useAuth();
  const { openProfile } = useProfileViewer();
  const meId = user?.id ?? "";
  const unreadCounts = useUnreadCounts();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
  const [hasOlder, setHasOlder] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);

  useEffect(() => {
    onConversationChange?.(mobileOpen);
    return () => onConversationChange?.(false);
  }, [mobileOpen, onConversationChange]);

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  useBackHandler(creating, () => setCreating(false), 25);
  useBackHandler(mobileOpen && visible, () => setMobileOpen(false), 20);
  const [sendError, setSendError] = useState<string | null>(null);

  const chatsRef = useRef<ChatItem[]>([]);
  chatsRef.current = chats;
  const messagesRef = useRef(messagesByChat);
  messagesRef.current = messagesByChat;
  const stateRef = useRef({ activeId, mobileOpen, visible });
  stateRef.current = { activeId, mobileOpen, visible };

  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const stickRef = useRef(true);
  const lastIdRef = useRef<string | null | undefined>(undefined);
  const keepOffsetRef = useRef<number | null>(null);

  useEdgeSwipeBack(paneRef, mobileOpen, () => setMobileOpen(false));

  const loadChats = useCallback(async () => {
    if (!meId) return;
    const { data: mine, error } = await supabase.from("chat_members").select("chat_id").eq("user_id", meId);
    if (error) {
      setLoading(false);
      return;
    }
    const ids = (mine ?? []).map((m) => m.chat_id);
    if (ids.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }
    const [chatRes, memberRes] = await Promise.all([
      supabase.from("chats").select("*").in("id", ids).order("last_message_at", { ascending: false }),
      supabase.from("chat_members").select("chat_id, profiles(id, display_name, handle, avatar_url)").in("chat_id", ids),
    ]);
    if (chatRes.error) {
      setLoading(false);
      return;
    }
    const membersByChat = new Map<string, Profile[]>();
    for (const row of (memberRes.data ?? []) as unknown as MembershipRow[]) {
      if (!row.profiles) continue;
      const list = membersByChat.get(row.chat_id) ?? [];
      list.push(row.profiles);
      membersByChat.set(row.chat_id, list);
    }
    const items: ChatItem[] = ((chatRes.data ?? []) as unknown as ChatRow[]).map((c) => ({
      ...c,
      members: membersByChat.get(c.id) ?? [],
    }));
    setChats(items);
    setLoading(false);
  }, [meId]);

  /** Последние сообщения диалога: открывается мгновенно, старые подгружаются по кнопке. */
  const loadMessages = useCallback(async (chatId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (error) return;
    const fresh = ((data ?? []) as Message[]).reverse();
    setMessagesByChat((prev) => {
      const old = prev[chatId] ?? [];
      const ids = new Set(fresh.map((m) => m.id));
      const oldest = fresh[0]?.created_at;
      const older = oldest ? old.filter((m) => !m.id.startsWith("tmp-") && !ids.has(m.id) && m.created_at < oldest) : [];
      const pending = old.filter((m) => m.id.startsWith("tmp-"));
      return { ...prev, [chatId]: [...older, ...fresh, ...pending] };
    });
    setHasOlder((prev) => (chatId in prev ? prev : { ...prev, [chatId]: (data ?? []).length === PAGE }));
  }, []);

  const loadOlder = useCallback(async () => {
    const chatId = stateRef.current.activeId;
    const first = chatId ? messagesRef.current[chatId]?.find((m) => !m.id.startsWith("tmp-")) : undefined;
    if (!chatId || !first) return;
    setLoadingOlder(true);
    const el = scrollerRef.current;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .lt("created_at", first.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const rows = ((data ?? []) as Message[]).reverse();
    if (el) keepOffsetRef.current = el.scrollHeight - el.scrollTop;
    setMessagesByChat((prev) => ({ ...prev, [chatId]: [...rows, ...(prev[chatId] ?? [])] }));
    setHasOlder((prev) => ({ ...prev, [chatId]: rows.length === PAGE }));
    setLoadingOlder(false);
  }, []);

  /** Добавить сообщение в диалог и поднять чат в списке. */
  const applyMessage = useCallback(
    (m: Message, animate = false) => {
      setMessagesByChat((prev) => {
        const current = prev[m.chat_id];
        if (!current || current.some((item) => item.id === m.id)) return prev;
        return { ...prev, [m.chat_id]: [...current, m] };
      });
      if (animate) setFreshId(m.id);
      if (!chatsRef.current.some((c) => c.id === m.chat_id)) {
        loadChats();
        return;
      }
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === m.chat_id);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], last_message: previewOf(m), last_message_at: m.created_at };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    },
    [loadChats],
  );

  const isViewing = useCallback((chatId: string) => {
    const st = stateRef.current;
    if (!st.visible || st.activeId !== chatId) return false;
    return st.mobileOpen || (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  }, []);

  useEffect(() => {
    if (!meId) return;
    loadChats();
    // RLS отдаёт события только по чатам, где я участник.
    const channel = supabase
      .channel(`tosto-chats-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.sender_id !== meId) {
          playSound("receive");
          if (isViewing(m.chat_id)) haptic("light");
          else addUnread(m.chat_id);
        } else if (!m.kind || m.kind === "text") {
          // Своё текстовое сообщение уже показано сразу, ответ сервера его заменит.
          const pending = messagesRef.current[m.chat_id]?.some((x) => x.id.startsWith("tmp-") && x.body === m.body);
          if (pending) return;
        }
        applyMessage(m, true);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${meId}` },
        () => loadChats(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meId, loadChats, applyMessage, isViewing]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Сменили диалог: прокрутка начинается заново, с низа.
  useLayoutEffect(() => {
    lastIdRef.current = undefined;
    stickRef.current = true;
  }, [activeId]);

  // Открыли диалог и смотрим на него: непрочитанных нет.
  useEffect(() => {
    if (activeId && visible && (mobileOpen || (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches))) {
      clearUnread(activeId);
    }
  }, [activeId, visible, mobileOpen, unreadCounts]);

  const messages = activeId ? (messagesByChat[activeId] ?? []) : [];

  // Подгрузили ранние сообщения: оставляем прокрутку на месте.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && keepOffsetRef.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffsetRef.current;
      keepOffsetRef.current = null;
    }
  }, [messages]);

  // Первое открытие: сразу вниз без анимации. Новое сообщение: плавно, если мы и так внизу или это своё.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !activeId) return;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (lastIdRef.current === lastId) return;
    const firstLoad = lastIdRef.current === undefined || lastIdRef.current === null;
    lastIdRef.current = lastId;
    if (!last) return;
    if (firstLoad) el.scrollTop = el.scrollHeight;
    else if (last.sender_id === meId || stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, activeId, meId]);

  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  // Поле ввода растёт вместе с текстом, как в Telegram.
  useEffect(() => {
    const t = taRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  }, [draft, activeId]);

  /** Загружает вложение в хранилище и создаёт сообщение. */
  async function sendMedia(kind: "image" | "file" | "voice", blob: Blob, name: string, mime: string, duration?: number) {
    if (!activeId || !meId) return;
    setSendError(null);
    setUploading(kind === "voice" ? "Отправка голосового…" : kind === "image" ? "Отправка фото…" : "Отправка файла…");
    try {
      const path = await uploadChatMedia(activeId, blob, name, mime);
      const { data, error } = await supabase
        .from("messages")
        .insert({
          chat_id: activeId,
          sender_id: meId,
          kind,
          body: "",
          media_path: path,
          media_name: name,
          media_mime: mime,
          media_size: blob.size,
          media_duration: duration ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      playSound("send");
      applyMessage(data as Message, true);
    } catch (e) {
      playSound("error");
      setSendError("Не удалось отправить: " + (e instanceof Error ? e.message : "ошибка"));
    } finally {
      setUploading(null);
    }
  }

  async function handlePicked(files: FileList | null, asPhoto: boolean) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setSendError(`Файл слишком большой: ${formatSize(file.size)}. Максимум ${formatSize(MAX_FILE_BYTES)}.`);
      return;
    }
    if (asPhoto && file.type.startsWith("image/")) {
      const c = await compressImage(file);
      await sendMedia("image", c.blob, c.name, c.mime);
    } else {
      await sendMedia("file", file, file.name || "file", file.type || "application/octet-stream");
    }
  }

  /** Сообщение появляется сразу, до ответа сервера; при ошибке возвращается в поле ввода. */
  async function send() {
    const text = draft.trim();
    if (!text || !activeId || !meId) return;
    const chatId = activeId;
    haptic("light");
    setDraft("");
    setSendError(null);
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    applyMessage(
      { id: tmpId, chat_id: chatId, sender_id: meId, body: text, created_at: new Date().toISOString(), kind: "text" },
      true,
    );
    const { data, error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, sender_id: meId, body: text })
      .select()
      .single();
    if (error || !data) {
      setMessagesByChat((prev) => ({ ...prev, [chatId]: (prev[chatId] ?? []).filter((m) => m.id !== tmpId) }));
      setDraft((d) => d || text);
      setSendError(error?.message ?? "Не удалось отправить");
      playSound("error");
      return;
    }
    playSound("send");
    const real = data as Message;
    setMessagesByChat((prev) => {
      const cur = prev[chatId] ?? [];
      const next = cur.some((m) => m.id === real.id)
        ? cur.filter((m) => m.id !== tmpId)
        : cur.map((m) => (m.id === tmpId ? real : m));
      return { ...prev, [chatId]: next };
    });
  }

  async function leaveGroup(chatId: string) {
    if (!window.confirm("Выйти из группы?")) return;
    const { error } = await supabase.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", meId);
    if (error) return;
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    setActiveId(null);
    setMobileOpen(false);
  }

  async function handleCreated(chatId: string) {
    setCreating(false);
    await loadChats();
    setActiveId(chatId);
    setMobileOpen(true);
  }

  const openChat = useCallback((id: string) => {
    haptic("light");
    setActiveId(id);
    setMobileOpen(true);
  }, []);

  // Открыть диалог, созданный снаружи (например, кнопкой «Написать» на странице профиля).
  useEffect(() => {
    if (!openChatId) return;
    let cancelled = false;
    (async () => {
      await loadChats();
      if (cancelled) return;
      setActiveId(openChatId);
      setMobileOpen(true);
      onOpenedChat?.();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChatId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? chats.filter((c) => chatTitle(c, meId).toLowerCase().includes(q)) : chats;
  }, [chats, search, meId]);
  const activeChat = chats.find((c) => c.id === activeId);
  const memberById = useMemo(() => {
    const map = new Map<string, Profile>();
    activeChat?.members.forEach((m) => map.set(m.id, m));
    return map;
  }, [activeChat]);
  const rows = useMemo(() => buildRows(messages), [messages]);
  const otherMember = activeChat?.type === "direct" ? activeChat.members.find((m) => m.id !== meId) : undefined;

  return (
    <div className="relative flex-1 flex h-full min-h-0 overflow-hidden">
      {/* Список чатов */}
      <div className="w-full sm:w-80 shrink-0 flex flex-col border-r border-border min-h-0 bg-background">
        <div className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-4 pb-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Чаты</h2>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setCreating(true);
              }}
              aria-label="Новый чат"
              className="press w-10 h-10 -mr-1.5 rounded-full flex items-center justify-center text-foreground active:bg-surface-2"
            >
              <PenSquare className="w-[21px] h-[21px]" />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск"
              className="w-full h-10 pl-10 pr-3 rounded-full bg-surface-2 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          {loading ? (
            <ChatListSkeleton />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center px-6">
              <p className="text-foreground text-base font-medium mb-1">
                {search.trim() ? "Ничего не найдено" : "Чатов пока нет"}
              </p>
              {!search.trim() && (
                <p className="text-muted-foreground text-sm">
                  Нажмите на иконку справа сверху, найдите человека и начните диалог.
                </p>
              )}
            </div>
          ) : (
            filtered.map((c) => (
              <ChatListRow
                key={c.id}
                chat={c}
                meId={meId}
                active={activeId === c.id}
                unread={unreadCounts[c.id] ?? 0}
                onOpen={openChat}
              />
            ))
          )}
        </div>
      </div>

      {/* Диалог: на телефоне выезжает справа поверх всего экрана, свайп от левого края возвращает назад */}
      <div
        ref={paneRef}
        className={`fixed inset-0 z-40 flex flex-col min-h-0 bg-background sm:static sm:z-auto sm:flex-1 sm:[transform:none] sm:visible transition-[transform,visibility] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
          mobileOpen ? "[transform:none] visible" : "[transform:translate3d(100%,0,0)] invisible"
        }`}
      >
        {activeChat ? (
          <>
            <div className="flex items-center gap-1 pl-1 pr-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2 border-b border-border noir-glass">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="К списку чатов"
                className="press sm:hidden w-10 h-10 rounded-full flex items-center justify-center text-foreground"
              >
                <ArrowLeft className="w-[22px] h-[22px]" />
              </button>
              <button
                type="button"
                disabled={!otherMember}
                onClick={() => otherMember && openProfile(otherMember.id)}
                className="flex-1 min-w-0 flex items-center gap-3 text-left sm:pl-3 disabled:cursor-default"
              >
                <UserAvatar name={chatTitle(activeChat, meId)} url={chatAvatarUrl(activeChat, meId)} size="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[16px] leading-tight text-foreground truncate">
                    {chatTitle(activeChat, meId)}
                  </p>
                  <p className="text-[13px] text-muted-foreground truncate">
                    {activeChat.type === "group" ? `${activeChat.members.length} участн.` : `@${otherMember?.handle ?? ""}`}
                  </p>
                </div>
              </button>
              {activeChat.type === "group" && (
                <button
                  type="button"
                  onClick={() => leaveGroup(activeChat.id)}
                  aria-label="Выйти из группы"
                  className="press w-10 h-10 rounded-full text-muted-foreground active:text-destructive flex items-center justify-center"
                >
                  <LogOut className="w-[19px] h-[19px]" />
                </button>
              )}
            </div>

            <div
              ref={scrollerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
              }}
              className="flex-1 overflow-y-auto px-2.5 py-3 noir-grid"
            >
              {messages.length === 0 ? (
                <div className="anim-fade-up h-full flex flex-col items-center justify-center text-center">
                  <UserAvatar
                    name={chatTitle(activeChat, meId)}
                    url={chatAvatarUrl(activeChat, meId)}
                    size="w-20 h-20"
                    className="text-xl mb-4"
                  />
                  <p className="text-foreground font-medium">{chatTitle(activeChat, meId)}</p>
                  <p className="text-muted-foreground text-sm mt-1">Напишите первое сообщение, чтобы начать беседу.</p>
                </div>
              ) : (
                <>
                  {activeId && hasOlder[activeId] && (
                    <div className="flex justify-center pb-2">
                      <button
                        type="button"
                        onClick={loadOlder}
                        disabled={loadingOlder}
                        className="press px-4 py-2 rounded-full bg-surface-2 text-[13px] text-muted-foreground flex items-center gap-2"
                      >
                        {loadingOlder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Показать ранние сообщения
                      </button>
                    </div>
                  )}
                  {rows.map((r) =>
                    r.type === "day" ? (
                      <div key={r.key} className="flex justify-center my-3">
                        <span className="px-3 py-1 rounded-full bg-surface-2 text-[12px] text-muted-foreground">
                          {r.label}
                        </span>
                      </div>
                    ) : (
                      <Bubble
                        key={r.m.id}
                        m={r.m}
                        mine={r.m.sender_id === meId}
                        isGroup={activeChat.type === "group"}
                        sender={memberById.get(r.m.sender_id)}
                        first={r.first}
                        last={r.last}
                        fresh={freshId === r.m.id}
                      />
                    ),
                  )}
                </>
              )}
            </div>

            <div className="px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-border bg-background relative">
              {sendError && <p className="mb-2 px-2 text-xs text-destructive">{sendError}</p>}
              {uploading && (
                <p className="mb-2 px-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {uploading}
                </p>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePicked(e.target.files, true);
                  e.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  handlePicked(e.target.files, false);
                  e.target.value = "";
                }}
              />

              {recording ? (
                <VoiceRecorderBar
                  onCancel={() => setRecording(false)}
                  onError={(msg) => setSendError(msg)}
                  onSend={(blob, mime, secs) => {
                    setRecording(false);
                    sendMedia("voice", blob, "voice." + (mime.includes("mp4") ? "m4a" : "webm"), mime.split(";")[0], secs);
                  }}
                />
              ) : (
                <div className="flex items-end gap-1.5">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        haptic("light");
                        setAttachOpen((v) => !v);
                      }}
                      aria-label="Прикрепить"
                      className="press w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground shrink-0"
                    >
                      <Paperclip className="w-[22px] h-[22px]" />
                    </button>
                    {attachOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setAttachOpen(false)} />
                        <div
                          style={{ transformOrigin: "0% 100%" }}
                          className="anim-pop-in absolute bottom-12 left-0 z-40 w-44 rounded-2xl bg-surface-2 border border-border overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setAttachOpen(false);
                              photoInputRef.current?.click();
                            }}
                            className="tap w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground"
                          >
                            <ImageIcon className="w-4 h-4 text-pulse" />
                            Фото
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachOpen(false);
                              fileInputRef.current?.click();
                            }}
                            className="tap w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground"
                          >
                            <FileText className="w-4 h-4 text-pulse" />
                            Файл
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-end bg-surface-2 rounded-[22px] px-4 py-[9px]">
                    <textarea
                      ref={taRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                      onFocus={() => {
                        window.setTimeout(() => {
                          const el = scrollerRef.current;
                          if (el) el.scrollTop = el.scrollHeight;
                        }, 280);
                      }}
                      onKeyDown={(e) => {
                        // На телефоне Enter переносит строку, как в Telegram; на компьютере отправляет.
                        if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder="Сообщение"
                      className="w-full bg-transparent text-[16px] leading-[1.3] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-[120px]"
                    />
                  </div>
                  {draft.trim() ? (
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={send}
                      aria-label="Отправить"
                      className="press w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
                    >
                      <Send className="w-[18px] h-[18px]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSendError(null);
                        setRecording(true);
                      }}
                      disabled={!!uploading}
                      aria-label="Записать голосовое"
                      className="press w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-muted-foreground disabled:opacity-35"
                    >
                      <Mic className="w-[22px] h-[22px]" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-border flex items-center justify-center text-muted-foreground mb-4">
              <PenSquare className="w-6 h-6" />
            </div>
            <p className="text-foreground font-medium">Выберите чат</p>
            <p className="text-muted-foreground text-sm mt-1">
              или найдите человека и создайте новый, чтобы начать общение.
            </p>
          </div>
        )}
      </div>

      <NewChatModal open={creating} meId={meId} onClose={() => setCreating(false)} onCreated={handleCreated} />
    </div>
  );
}

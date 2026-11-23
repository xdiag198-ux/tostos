import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Home, MessageCircle, Pencil, Search as SearchIcon } from "lucide-react";
import { Intro } from "@/components/Intro";
import { Feed } from "@/components/Feed";
import { Chats } from "@/components/Chats";
import { Search } from "@/components/Search";
import { ProfilePage } from "@/components/ProfilePage";
import { ProfileViewerProvider } from "@/lib/profileView";
import { PlayerProvider } from "@/lib/player";
import { haptic } from "@/lib/haptics";
import { installBackButton, useBackHandler } from "@/lib/backStack";
import { NewPostModal } from "@/components/NewPostModal";
import { AuthGate } from "@/components/AuthGate";
import { registerPush } from "@/lib/push";
import { ProfileModal } from "@/components/ProfileModal";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { useEdgeSwipeBack } from "@/lib/swipeBack";
import { useUnreadTotal } from "@/lib/unread";
import { installNativeExperience } from "@/lib/nativeExperience";

export type View = "feed" | "search" | "chats" | "profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tosto — Мессенджер и лента" },
      {
        name: "description",
        content: "Tosto — минималистичный чёрный мессенджер и социальная лента в реальном времени.",
      },
      { property: "og:title", content: "Tosto — Мессенджер и лента" },
      {
        property: "og:description",
        content: "Tosto — минималистичный чёрный мессенджер и социальная лента в реальном времени.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/** Нижняя панель вкладок, как в Telegram: Лента, Поиск, Чаты, Профиль. Одинаковая на телефоне и на компьютере. */
function TabBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const unread = useUnreadTotal();
  const { profile } = useAuth();
  const items = [
    { id: "feed" as const, label: "Лента", icon: Home },
    { id: "search" as const, label: "Поиск", icon: SearchIcon },
    { id: "chats" as const, label: "Чаты", icon: MessageCircle },
    { id: "profile" as const, label: "Профиль", icon: null },
  ];
  return (
    <nav
      aria-label="Разделы"
      className="tosto-mobile-nav pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-md items-stretch gap-1 rounded-[30px] border border-border bg-surface-1/95 p-1.5 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.65)]">
        {items.map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          const badge = item.id === "chats" && unread > 0 && !active ? unread : 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (!active) haptic("light");
                setView(item.id);
              }}
              className="press relative flex flex-1 flex-col items-center gap-0.5 rounded-[24px] py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-[24px] bg-pulse/15"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative flex h-6 items-center justify-center">
                {Icon ? (
                  <Icon
                    className={`h-[24px] w-[24px] transition-colors ${active ? "text-pulse" : "text-muted-foreground"}`}
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                ) : (
                  <span className={`rounded-full p-[1.5px] transition-colors ${active ? "bg-pulse" : "bg-transparent"}`}>
                    <UserAvatar name={profile?.display_name ?? "Вы"} url={profile?.avatar_url} size="w-[22px] h-[22px]" className="text-[9px]" />
                  </span>
                )}
                <AnimatePresence>
                  {badge > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 26 }}
                      className="absolute -top-1.5 left-3.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pulse px-1 text-[11px] font-semibold tabular-nums text-primary-foreground"
                    >
                      {badge > 99 ? "99+" : badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className={`relative text-[11px] font-medium leading-none transition-colors ${active ? "text-pulse" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Экран-вкладка. Однажды открытая вкладка остаётся в памяти: переключение мгновенное,
 * прокрутка и введённый текст сохраняются, ленту и чаты не нужно загружать заново.
 */
function Pane({ active, mounted, children }: { active: boolean; mounted: boolean; children: ReactNode }) {
  if (!mounted) return null;
  return (
    <div
      className={`absolute inset-0 flex min-w-0 pb-tabbar ${
        active ? "anim-view-in" : "pointer-events-none"
      }`}
      style={{ contentVisibility: active ? "visible" : "hidden" }}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

/** Страница, выезжающая справа. Закрывается кнопкой, «назад» на Android или свайпом от левого края. */
function SlideOver({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lingering, setLingering] = useState(false);
  const wasOpen = useRef(open);
  const skipExit = useRef(false);

  useLayoutEffect(() => {
    let fallback: number | undefined;
    if (!open && wasOpen.current && !skipExit.current) {
      setLingering(true);
      // Если анимации отключены в системе, событие её конца не придёт: убираем страницу по таймеру.
      fallback = window.setTimeout(() => setLingering(false), 320);
    }
    if (open) setLingering(false);
    wasOpen.current = open;
    skipExit.current = false;
    return () => window.clearTimeout(fallback);
  }, [open]);

  useEdgeSwipeBack(ref, open, () => {
    skipExit.current = true;
    onClose();
  });

  if (!open && !lingering) return null;
  return (
    <div
      ref={ref}
      className={`fixed inset-0 z-50 bg-background ${open ? "anim-slide-in" : "anim-slide-out"}`}
      onAnimationEnd={(e) => {
        if (!open && e.target === e.currentTarget) setLingering(false);
      }}
    >
      {children}
    </div>
  );
}

function AppShell() {
  const [feedKey, setFeedKey] = useState(0);
  const [intro, setIntro] = useState(true);
  const [view, setViewState] = useState<View>("feed");
  const [visited, setVisited] = useState<ReadonlySet<View>>(() => new Set<View>(["feed"]));
  const [showNewPost, setShowNewPost] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lastProfileId, setLastProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const { user } = useAuth();
  const userId = user?.id;

  const setView = useCallback((v: View) => {
    setViewState(v);
    setVisited((prev) => (prev.has(v) ? prev : new Set(prev).add(v)));
  }, []);

  const openProfile = useCallback((id: string | null) => {
    setProfileId(id);
    if (id) setLastProfileId(id);
  }, []);

  // Чаты подготавливаем заранее, пока человек смотрит ленту: вкладка открывается без ожидания, счётчик непрочитанных работает сразу.
  useEffect(() => {
    const t = setTimeout(() => setVisited((prev) => (prev.has("chats") ? prev : new Set(prev).add("chats"))), 1200);
    return () => clearTimeout(t);
  }, []);

  const viewerValue = useMemo(() => ({ openProfile }), [openProfile]);

  // Пуш-уведомления: просим разрешение, отправляем токен устройства в Supabase, по нажатию открываем чаты.
  useEffect(() => {
    if (!userId) return;
    let cleanup: (() => void) | undefined;
    registerPush(() => setView("chats")).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [userId, setView]);

  // Нативная среда: динамическая высота WebView, клавиатура и события возврата из фона.
  useEffect(() => installNativeExperience(), []);

  // Кнопка «назад» на Android: окна, страница профиля, вкладка. Если закрывать нечего, приложение сворачивается.
  useEffect(() => installBackButton(), []);
  useBackHandler(intro, () => setIntro(false), 100);
  useBackHandler(showProfile, () => setShowProfile(false), 40);
  useBackHandler(showNewPost, () => setShowNewPost(false), 40);
  useBackHandler(profileId !== null, () => setProfileId(null), 30);
  useBackHandler(view !== "feed", () => setView("feed"), 10);

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1050);
    return () => clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <ProfileViewerProvider value={viewerValue}>
        <PlayerProvider>
          <div className="tosto-app-shell w-screen flex bg-background noir-mesh text-foreground overflow-hidden">
            <Intro show={intro} onSkip={() => setIntro(false)} />

            <main className="relative flex-1 flex flex-col min-w-0 h-full">
              <div className="relative flex-1 min-h-0">
                <Pane active={view === "feed"} mounted={visited.has("feed")}>
                  <div className="flex-1 flex flex-col min-w-0 max-w-2xl mx-auto w-full">
                    <Feed key={feedKey} />
                  </div>
                </Pane>
                <Pane active={view === "search"} mounted={visited.has("search")}>
                  <div className="flex-1 flex flex-col min-w-0 max-w-2xl mx-auto w-full">
                    <Search initialQuery={searchQuery} />
                  </div>
                </Pane>
                <Pane active={view === "chats"} mounted={visited.has("chats")}>
                  <Chats
                    visible={view === "chats"}
                    openChatId={openChatId}
                    onOpenedChat={() => setOpenChatId(null)}
                  />
                </Pane>
                <Pane active={view === "profile"} mounted={visited.has("profile")}>
                  {userId && (
                    <ProfilePage
                      key={`me-${userId}-${feedKey}`}
                      userId={userId}
                      embedded
                      onEdit={() => setShowProfile(true)}
                      onMessage={() => {}}
                    />
                  )}
                </Pane>
              </div>

              <AnimatePresence>
                {view === "feed" && profileId === null && (
                  <motion.button
                    key="fab"
                    type="button"
                    aria-label="Новый пост"
                    initial={{ scale: 0, rotate: -45, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0, rotate: 45, opacity: 0 }}
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    onClick={() => {
                      haptic("light");
                      setShowNewPost(true);
                    }}
                    className="fab-offset fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_24px_-6px_rgba(42,171,238,0.55)] sm:right-[max(1rem,calc(50%-21rem))]"
                  >
                    <Pencil className="h-6 w-6" />
                  </motion.button>
                )}
              </AnimatePresence>

              <SlideOver open={profileId !== null} onClose={() => setProfileId(null)}>
                {lastProfileId && (
                  <ProfilePage
                    key={`${lastProfileId}-${feedKey}`}
                    userId={lastProfileId}
                    onClose={() => setProfileId(null)}
                    onEdit={() => setShowProfile(true)}
                    onMessage={(chatId) => {
                      setProfileId(null);
                      setOpenChatId(chatId);
                      setView("chats");
                    }}
                  />
                )}
              </SlideOver>
            </main>

            <TabBar view={view} setView={setView} />

            <ProfileModal
              show={showProfile}
              onClose={() => setShowProfile(false)}
              onSaved={() => setFeedKey((k) => k + 1)}
            />

            <NewPostModal
              show={showNewPost}
              onClose={() => setShowNewPost(false)}
              onPosted={() => setFeedKey((k) => k + 1)}
            />
          </div>
        </PlayerProvider>
      </ProfileViewerProvider>
    </MotionConfig>
  );
}

function Index() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}

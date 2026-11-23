import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, SendHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sounds";
import { haptic } from "@/lib/haptics";
import { UserAvatar } from "./UserAvatar";

type Props = {
  show: boolean;
  onClose: () => void;
  onPosted: () => void;
};

const LIMIT = 500;

/** Шторка снизу, как в Telegram: тянется вверх, закрывается касанием по фону. */
export function NewPostModal({ show, onClose, onPosted }: Props) {
  const { user, profile } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Поле растёт вместе с текстом.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text, show]);

  async function submit() {
    const body = text.trim();
    if (!body || body.length > LIMIT || !user || busy) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from("posts").insert({ author_id: user.id, body });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    haptic("medium");
    setText("");
    playSound("post");
    onPosted();
    onClose();
  }

  const left = LIMIT - text.length;
  const ready = !!text.trim() && !busy;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl border border-border bg-surface-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:max-w-lg sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" aria-hidden="true" />
            <div className="flex gap-3">
              <UserAvatar name={profile?.display_name ?? "?"} url={profile?.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{profile?.display_name ?? "Новый пост"}</p>
                <textarea
                  ref={areaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, LIMIT))}
                  autoFocus
                  rows={2}
                  placeholder="Что нового? Отметьте друга через @ник"
                  className="mt-1 w-full resize-none bg-transparent text-[15px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className={`text-xs tabular-nums transition-colors ${left < 40 ? "text-destructive" : "text-muted-foreground"}`}>
                {left < 100 ? `Осталось ${left}` : `${text.length}/${LIMIT}`}
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={submit}
                disabled={!ready}
                aria-label="Опубликовать"
                animate={{ scale: ready ? 1 : 0.94, opacity: ready ? 1 : 0.45 }}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Опубликовать
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

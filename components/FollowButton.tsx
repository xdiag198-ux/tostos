import { motion } from "framer-motion";
import { Check, Loader2, UserPlus } from "lucide-react";

export function FollowButton({
  following,
  busy,
  onClick,
  small,
}: {
  following: boolean;
  busy?: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-60 ${
        small ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm"
      } ${
        following
          ? "bg-surface-2 border border-border text-foreground hover:border-destructive/50 hover:text-destructive"
          : "bg-primary text-primary-foreground hover:opacity-90"
      }`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <UserPlus className="w-3.5 h-3.5" />
      )}
      {following ? "Вы подписаны" : "Подписаться"}
    </motion.button>
  );
}

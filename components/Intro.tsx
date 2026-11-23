import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Logo } from "./Logo";

type IntroProps = {
  show: boolean;
  onSkip?: () => void;
};

/** Лёгкая заставка для Android WebView: только opacity/transform, без blur, clip-path и бесконечных эффектов. */
export function Intro({ show, onSkip }: IntroProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background noir-grid"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0.12 : 0.2, ease: "easeOut" } }}
          onClick={onSkip}
        >
          <div className="pointer-events-none absolute inset-0 noir-mesh opacity-60" />
          <motion.div
            className="relative flex flex-col items-center gap-5"
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <Logo className="h-20 w-20" />
            <div className="font-display text-5xl font-bold tracking-tight text-platinum">Tosto</div>
            <motion.p
              className="text-sm tracking-wide text-muted-foreground"
              initial={reduce ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: reduce ? 0 : 0.16 }}
            >
              Пиши. Делись. Будь на связи.
            </motion.p>
          </motion.div>
          <span className="sr-only">Нажми, чтобы пропустить заставку</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

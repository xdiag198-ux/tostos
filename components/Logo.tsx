import { motion } from "framer-motion";

type LogoProps = {
  className?: string;
  animated?: boolean;
};

export function Logo({ className = "w-9 h-9", animated = false }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tosto">
      <defs>
        <linearGradient id="tosto-noir-bg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#35A9EC" />
          <stop offset="1" stopColor="#1A6FB5" />
        </linearGradient>
        <linearGradient id="tosto-noir-rim" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#71717A" stopOpacity="0.25" />
          <stop offset="1" stopColor="#BFE4FA" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="tosto-noir-mark" x1="18" y1="18" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCEEFB" />
        </linearGradient>
      </defs>

      <motion.path
        d="M16 7H48C53 7 57 11 57 16V43C57 48 53 52 48 52H24.5L13.5 58.5L15.8 49.8C10.5 48.2 7 44.5 7 39.5V16C7 11 11 7 16 7Z"
        fill="url(#tosto-noir-bg)"
        stroke="url(#tosto-noir-rim)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.path
        d="M19 21.5H45"
        stroke="url(#tosto-noir-mark)"
        strokeWidth="4.4"
        strokeLinecap="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.path
        d="M32 21.5V41.5"
        stroke="url(#tosto-noir-mark)"
        strokeWidth="4.4"
        strokeLinecap="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.circle
        cx="45.5"
        cy="39.5"
        r="4.2"
        fill="#34D399"
        initial={animated ? { scale: 0, opacity: 0 } : false}
        animate={animated ? { scale: [0, 1.35, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.72, ease: "easeOut" }}
      />
    </svg>
  );
}
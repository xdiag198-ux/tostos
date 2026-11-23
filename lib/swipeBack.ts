import { useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { haptic } from "@/lib/haptics";

const EDGE = 28; // свайп «назад» начинается у левого края экрана, как в Telegram и iOS
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * Свайп от левого края: экран едет за пальцем, при отпускании доезжает или возвращается.
 * Двигаем элемент напрямую через transform, без перерисовок React, поэтому без лагов.
 */
export function useEdgeSwipeBack(ref: RefObject<HTMLElement | null>, enabled: boolean, onBack: () => void) {
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let sx = 0;
    let sy = 0;
    let dx = 0;
    let t0 = 0;
    let tracking = false;
    let locked = false;

    const reset = () => {
      el.style.transition = "none";
      el.style.transform = "";
      el.style.willChange = "";
      requestAnimationFrame(() => {
        el.style.transition = "";
      });
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > EDGE) return;
      sx = t.clientX;
      sy = t.clientY;
      dx = 0;
      t0 = performance.now();
      tracking = true;
      locked = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const mx = t.clientX - sx;
      const my = t.clientY - sy;
      if (!locked) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
          tracking = false;
          return;
        }
        if (mx < 8) return;
        locked = true;
        el.style.transition = "none";
        el.style.willChange = "transform";
      }
      dx = Math.max(0, mx);
      el.style.transform = `translate3d(${dx}px,0,0)`;
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!locked) return;
      locked = false;
      const w = el.offsetWidth || window.innerWidth;
      const speed = dx / Math.max(1, performance.now() - t0);
      const commit = dx > w * 0.3 || speed > 0.6;
      el.style.transition = `transform 0.2s ${EASE}`;
      el.style.transform = commit ? "translate3d(100%,0,0)" : "translate3d(0,0,0)";
      window.setTimeout(() => {
        if (commit) {
          haptic("light");
          flushSync(() => backRef.current());
        }
        reset();
      }, 200);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, enabled]);
}

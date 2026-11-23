import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Кого читаю я: общий набор id для кнопок «Подписаться» в поиске и списках. */
export function useFollowing(meId: string) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!meId) return;
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", meId)
      .then(({ data }) => setIds(new Set((data ?? []).map((r) => r.following_id))));
  }, [meId]);

  const toggle = useCallback(
    async (targetId: string) => {
      if (!meId || targetId === meId) return;
      const was = ids.has(targetId);
      setBusyId(targetId);
      setIds((prev) => {
        const next = new Set(prev);
        if (was) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
      const res = was
        ? await supabase.from("follows").delete().eq("follower_id", meId).eq("following_id", targetId)
        : await supabase.from("follows").insert({ follower_id: meId, following_id: targetId });
      setBusyId(null);
      if (res.error) {
        setIds((prev) => {
          const next = new Set(prev);
          if (was) next.add(targetId);
          else next.delete(targetId);
          return next;
        });
      }
    },
    [meId, ids],
  );

  return { ids, busyId, toggle };
}

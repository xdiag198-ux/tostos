import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types";

const cache = new Map<string, Profile | null>();

export function invalidateProfile(id: string) {
  cache.delete(id);
}

/** Профиль по id с кешем (нужен для realtime-событий, где приходит только строка без join). */
export async function getProfile(id: string): Promise<Profile | null> {
  if (cache.has(id)) return cache.get(id) ?? null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .eq("id", id)
    .maybeSingle();
  const profile = (data as Profile | null) ?? null;
  cache.set(id, profile);
  return profile;
}

import { useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useSupabaseBrowser() {
  return useMemo(() => createSupabaseBrowserClient(), []);
}

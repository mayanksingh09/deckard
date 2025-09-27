"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

const SupabaseContext = createContext<SupabaseClient<Database> | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabaseClient() {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error("useSupabaseClient must be used within a SupabaseProvider");
  }

  return context;
}

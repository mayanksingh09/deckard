"use client";

import { SupabaseProvider } from "@/components/providers/supabase-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SupabaseProvider>{children}</SupabaseProvider>;
}

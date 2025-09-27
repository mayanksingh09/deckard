import type { Database } from "./types";
import { createSupabaseServerClient } from "./server";

export async function getProfile(profileId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, media_assets(*), processing_jobs(*), memories(*), conversations(id, title, created_at)")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listProcessingJobs(profileId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data satisfies Database["public"]["Tables"]["processing_jobs"]["Row"][];
}

export async function upsertMemory(input: {
  profileId: string;
  label: string;
  content: string;
  embedding?: number[];
  importance?: number;
}) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memories")
    .upsert({
      profile_id: input.profileId,
      label: input.label,
      content: input.content,
      embedding: input.embedding ?? null,
      importance: input.importance ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

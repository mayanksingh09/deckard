import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");
  const supabase = createSupabaseServerClient();

  const query = supabase
    .from("processing_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error } = await (profileId ? query.eq("profile_id", profileId) : query);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const payload = await request.json();

  const { data, error } = await supabase
    .from("processing_jobs")
    .insert({
      profile_id: payload.profile_id,
      job_type: payload.job_type,
      status: payload.status ?? "queued",
      output_asset_id: payload.output_asset_id ?? null,
      error_message: payload.error_message ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: data }, { status: 201 });
}

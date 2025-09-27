import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const payload = await request.json();

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: payload.id,
      email: payload.email ?? null,
      full_name: payload.full_name,
      preferred_name: payload.preferred_name ?? null,
      persona_prompt: payload.persona_prompt ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data }, { status: 201 });
}

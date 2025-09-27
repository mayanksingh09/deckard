create extension if not exists "vector";

-- Enum definitions
create type public.asset_type as enum ('video', 'audio', 'image', 'transcript', 'other');
create type public.asset_status as enum ('pending', 'processing', 'ready', 'failed');
create type public.job_type as enum ('voice_cloning', 'avatar_rig', 'transcription', 'memory_embedding');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.message_role as enum ('user', 'assistant', 'system');

-- Profiles table stores core metadata about the person being cloned
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  full_name text not null,
  preferred_name text,
  persona_prompt text,
  avatar_asset_id uuid,
  voice_model_id text,
  last_session_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Media assets capture uploaded audio/video/images and generated artifacts
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  type public.asset_type not null,
  storage_path text not null,
  duration_seconds numeric,
  status public.asset_status not null default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Processing jobs track long-running avatar/voice operations
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  job_type public.job_type not null,
  status public.job_status not null default 'queued',
  output_asset_id uuid references public.media_assets(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversations represent chat sessions with the avatar
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  title text,
  context_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages capture utterances within a conversation
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  audio_asset_id uuid references public.media_assets(id),
  latency_ms integer,
  created_at timestamptz not null default now()
);

-- Memories store extracted facts/personality traits with optional embeddings
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  label text not null,
  content text not null,
  embedding vector(1536),
  importance numeric,
  created_at timestamptz not null default now()
);

-- Session events capture realtime activity (stream statuses, user interactions)
create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  session_id uuid not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

create trigger processing_jobs_updated_at
  before update on public.processing_jobs
  for each row execute function public.touch_updated_at();

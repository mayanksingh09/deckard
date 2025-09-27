# Deckard Avatar Studio

Prototype workspace for the Deckard deep research plan: build a real-time personal AI avatar that looks, sounds, and speaks like the user. This Next.js app provides the routing, Supabase integration stubs, and front-end scaffolding required to iterate quickly on media ingestion, model orchestration, and live conversation.

## Stack
- Next.js App Router + TypeScript + Tailwind
- Supabase (Postgres, Storage, Auth) via `@supabase/ssr`
- React client components wired for streaming/chat features

## Project layout
```
web/
  src/app          # Route groups (marketing, onboarding, studio, API routes)
  src/components   # Layout chrome + providers
  src/lib/supabase # Typed Supabase helpers and queries
  src/hooks        # Client-side utilities (e.g., Supabase client memoization)
  supabase/        # Database schema (migrations)
```

Key pages:
- `/` &rarr; product overview and value props for the avatar platform
- `/onboarding` &rarr; guided capture flow for profile data + media intake
- `/studio` &rarr; live session shell with avatar canvas, transcript log, and pipeline status cards

## Getting started
1. Install dependencies
   ```bash
   npm install
   ```
2. Configure environment variables
   ```bash
   cp .env.example .env.local
   # populate NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, etc.
   ```
3. Apply the initial Supabase schema (from the project root with Supabase CLI)
   ```bash
   supabase db reset --db-url "$SUPABASE_DB_URL"
   ```
4. Launch the dev server
   ```bash
   npm run dev
   ```

## Database blueprint
`supabase/migrations/0001_init.sql` defines enums and tables for:
- `profiles` &rarr; persona metadata + settings
- `media_assets` &rarr; uploaded/derived audio, video, images
- `processing_jobs` &rarr; long-running cloning tasks with status tracking
- `conversations`, `messages` &rarr; chat transcripts tied to sessions
- `memories` &rarr; extracted highlights with optional vector embeddings (requires `pgvector`)
- `session_events` &rarr; realtime telemetry for the avatar loop

These tables power the server helpers in `src/lib/supabase` and the REST-style API routes in `src/app/api/*` that front the onboarding and orchestration flows.

## Next steps
- Drop real upload components (video/audio) into the onboarding steps and wire to Supabase Storage.
- Stream voice/audio generation into the Studio placeholders (WebRTC + media pipeline).
- Layer GPT orchestration and memory retrieval actions using the Supabase queries.

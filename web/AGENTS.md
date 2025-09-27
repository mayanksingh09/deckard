# Repository Guidelines

Use this guide to align contributions with the expectations of the Deckard web app.

## Project Structure & Module Organization
The Next.js codebase lives under `web/`. Route handlers, layouts, and pages reside in `web/src/app/`, shared UI lives in `web/src/components/`, and reusable hooks in `web/src/hooks/`. Supabase helpers sit in `web/src/lib/`. Database schema and migrations are versioned in `web/supabase/`; create new migrations rather than altering existing ones. Planning docs stay in `docs/`, keeping the app tree clean.

## Build, Test, and Development Commands
Run `npm install` once to sync dependencies. `npm run dev` starts the local Next.js server, while `npm run build` produces the production bundle and `npm run start` serves it. Use `npm run lint` (append `-- --fix` for autofixes) before opening a PR. Supabase changes should be applied locally with `supabase db reset --db-url "$SUPABASE_DB_URL"`.

## Coding Style & Naming Conventions
All source files use TypeScript ES modules with 2-space indentation. Prefer named exports; React components use PascalCase filenames that mirror their import path (e.g., `src/app/studio/page.tsx`). Styling defaults to Tailwind utility classes, with global overrides limited to `web/src/app/globals.css`. Run ESLint (`npm run lint -- --fix`) to enforce formatting and import ordering.

## Testing Guidelines
Automated tests are not yet standardized; add lightweight React Testing Library or Playwright coverage beside the implementation (`Component.test.tsx`) when introducing new behavior. Always sanity-check critical flows like `/onboarding` and `/studio` after schema or auth changes and document remaining gaps in your PR.

## Commit & Pull Request Guidelines
Write commits in the imperative mood, e.g., “Add onboarding upload step.” PRs should include a concise summary, relevant screenshots for UI tweaks, confirmation that `npm run lint` passed, and notes on Supabase migrations or required environment variables. Link to planning notes in `docs/` where decisions originated.

## Security & Configuration Tips
Copy `.env.example` to `.env.local`, supply Supabase keys, and export `SUPABASE_DB_URL` before running CLI commands. Keep secrets out of version control and rely on the Supabase dashboard for environment-specific credentials.

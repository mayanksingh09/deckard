# Repository Guidelines

## Project Structure & Module Organization
The Next.js app lives in `web/`. Routes, layouts, and API handlers are in `web/src/app/`, shared React pieces in `web/src/components/`, client hooks in `web/src/hooks/`, and Supabase helpers in `web/src/lib/`. Database schema and migrations sit under `web/supabase/`. Non-code planning notes stay in `docs/` to keep the app tree focused.

## Build, Test, and Development Commands
From `web/`, run `npm install` once to pull dependencies. Use `npm run dev` for the local development server, `npm run build` to create a production bundle, `npm run start` to serve the built app, and `npm run lint` to execute ESLint with the shared config. Supabase schema changes should be applied via `supabase db reset --db-url "$SUPABASE_DB_URL"` so local migrations stay in sync.

## Coding Style & Naming Conventions
All UI and server modules use TypeScript with ES modules. Favor named exports for shared utilities and PascalCase for React components. Components, routes, and hooks should live in directories that match their import path (e.g., `studio/page.tsx`). Tailwind CSS is the default styling layer—prefer utility classes over bespoke CSS and keep any custom styles in `globals.css`. Maintain 2-space indentation and rely on ESLint autofix (`npm run lint -- --fix`) before committing.

## Testing Guidelines
Formal automated tests are not wired yet; contributions introducing new behavior should include lightweight verification. Co-locate component tests beside the implementation (e.g., `component.test.tsx`) and use Playwright or React Testing Library as needed. Always exercise critical flows (`/onboarding`, `/studio`) manually after schema or auth changes and document gaps in the PR description.

## Commit & Pull Request Guidelines
Write commits in the imperative mood with a concise subject ("Add onboarding upload step"), optionally followed by wrapped body text explaining context or follow-ups. Each PR should include: a summary of the change, screenshots or screen recordings for UI tweaks, confirmation that `npm run lint` passes, and notes on Supabase migrations or required environment variables. Link to planning notes in `docs/` when relevant so reviewers can trace decisions.

## Supabase & Environment Tips
Copy `.env.example` to `.env.local`, fill the Supabase keys, and export `SUPABASE_DB_URL` when running CLI commands. Keep secrets out of commits—use `.env.local` and the Supabase dashboard instead. Database updates should land in a new migration file under `web/supabase/migrations/` to retain reproducibility for the avatar workflows.

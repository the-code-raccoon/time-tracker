# Time Tracker

A personal, password-protected time tracker that syncs both ways with a Google Calendar.
See [docs/PRD.md](docs/PRD.md) for the full requirements.

**Stack:** React + TypeScript + Vite, MUI (dark theme), Vercel serverless functions (`api/`), PostgreSQL on Supabase, Vitest.

## Getting started

Requires Node 22+ and Yarn 1.

```bash
yarn install
cp .env.example .env.local
yarn hash-password          # paste the output into .env.local
openssl rand -base64 48     # paste as SESSION_SECRET in .env.local
# add DATABASE_URL (Supabase → Connect → Transaction pooler) to .env.local
yarn db:migrate
yarn dev
```

`yarn dev` serves both the app and the `api/` functions at http://localhost:5173. It also listens on your LAN, so you can test on your phone.

## Google Calendar

1. In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**, open the OAuth web client and add these **Authorized redirect URIs**:
   - `http://localhost:5173/api/google/callback`
   - `https://<your-app>.vercel.app/api/google/callback`
2. Set the `GOOGLE_*` variables and `TOKEN_ENCRYPTION_KEY` (see `.env.example`). In Vercel, `GOOGLE_REDIRECT_URI` is the Vercel URL.
3. In the app: **Settings → Connect Google Calendar**, then **Import from Google Calendar**. After that, the ⟳ button in the toolbar pulls new changes.

Pulling never writes to Google Calendar. Entries changed in both places are set aside for reconciling (M3).

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server (app + API) |
| `yarn test` / `yarn test:watch` | Run the Vitest suite once / in watch mode |
| `yarn coverage` | Test coverage report |
| `yarn typecheck` | Type-check the app, API and config |
| `yarn lint` | Lint with oxlint |
| `yarn build` | Production build to `dist/` |
| `yarn hash-password` | Generate `APP_PASSWORD_HASH` |
| `yarn db:migrate` | Apply pending SQL migrations in `db/migrations/` to `DATABASE_URL` |

## Project layout

```
api/            Vercel functions — one file per route, exporting GET/POST/… (Web Request → Response)
server/         Server-only code shared by the API routes (auth, database, repositories, validation)
shared/         Types and helpers used by both the API and the app
db/migrations/  Plain SQL migrations, applied in name order
src/            React app
tests/          API route tests (kept out of api/, where every file becomes a function)
vite-plugins/   Dev-only Vite plugin that serves api/ locally
scripts/        CLI helpers
docs/           Product requirements
```

Server imports use explicit `.js` extensions (Node ESM), so they also resolve on Vercel.

## Deploying to Vercel

1. Import the repo in Vercel. `vercel.json` sets the build (`yarn vercel-build`, which runs the tests before building).
2. Add `APP_PASSWORD_HASH`, `SESSION_SECRET`, `DATABASE_URL`, the `GOOGLE_*` variables and `TOKEN_ENCRYPTION_KEY` under **Settings → Environment Variables**.
3. Run `yarn db:migrate` locally whenever a new migration is added (migrations are not run during the build).

## Testing

`yarn test` runs everything. Server tests use [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) with the real migrations applied, so SQL is tested without touching Supabase. Tests run in the `America/Toronto` timezone.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), e.g. `feat(sync): pull events from Google Calendar`.

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

## Logging in

Logging in takes two steps: the app password, then Google sign-in with the account in `ALLOWED_GOOGLE_EMAIL`. Any other Google account is refused, so the password alone doesn't get anyone in. Sessions last 7 days. Google sign-in needs the OAuth client and redirect URIs from [Google Calendar](#google-calendar) below, and because the callback is on `localhost`, logging in from another device on your LAN doesn't work in dev.

## Google Calendar

1. In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**, open the OAuth web client and add these **Authorized redirect URIs**:
   - `http://localhost:5173/api/google/callback` and `http://localhost:5173/api/auth/callback`
   - `https://<your-app>.vercel.app/api/google/callback` and `https://<your-app>.vercel.app/api/auth/callback`
2. Set the `GOOGLE_*` variables and `TOKEN_ENCRYPTION_KEY` (see `.env.example`). In Vercel, `GOOGLE_REDIRECT_URI` is the Vercel URL.
3. In the app: **Settings → Connect Google Calendar**, then **Import from Google Calendar**. After that, the ⟳ button in the toolbar syncs.

The ⟳ button runs a two-way sync. Entries changed in both places are set aside for reconciling. Backups (Settings → Backups) are kept for 30 days and can be restored to the app, to Google Calendar, or both.

## Install as an app

Production builds are an installable PWA: Settings → Install app (Chrome/Edge/Android), or Share → Add to Home Screen on iOS. Press `?` in the calendar for keyboard shortcuts.

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
api/index.ts    The only Vercel function; vercel.json rewrites /api/* to it
server/routes/  API route handlers — one file per route, exporting GET/POST/… (Web Request → Response)
server/         Server-only code: the route table (router.ts), auth, database, repositories, validation
shared/         Types and helpers used by both the API and the app
db/migrations/  Plain SQL migrations, applied in name order
src/            React app
tests/          API route tests
vite-plugins/   Dev-only Vite plugin that serves the API routes locally
scripts/        CLI helpers
docs/           Product requirements
```

Server imports use explicit `.js` extensions (Node ESM), so they also resolve on Vercel. A new route goes in `server/routes/` and needs an entry in the table in `server/router.ts`. Vercel's Hobby plan allows at most 12 functions per deployment, so don't add files to `api/`.

## Deploying to Vercel

`vercel.json` sets the build (`yarn build:vercel`, which runs the tests before building). Deploys are done with the [Vercel CLI](https://vercel.com/docs/cli).

### One-time setup

```bash
npx vercel login
npx vercel link             # pick the existing time-tracker project; writes the git-ignored .vercel/
```

### Environment variables

Production values live in `.env.production` (git-ignored, same keys as `.env.example`). `GOOGLE_REDIRECT_URI` must be the production URL, `https://<your-app>.vercel.app/api/google/callback`, and that URL must also be an authorized redirect URI in Google Cloud Console (see [Google Calendar](#google-calendar)).

Push every variable to the Production environment (`--force` overwrites existing values):

```bash
grep -E '^[A-Z_]+=' .env.production | while IFS='=' read -r name value; do
  printf '%s' "$value" | npx vercel env add "$name" production --force
done
```

Check them with `npx vercel env ls production`. Changed variables only apply to new deployments, so redeploy afterwards.

### Deploy

```bash
yarn db:migrate             # only if there are new migrations; they are not run during the build
npx vercel --prod
```

`npx vercel` (without `--prod`) makes a preview deployment instead. `.vercelignore` keeps `.env*` files and `credentials.json` out of the upload.

## Testing

`yarn test` runs everything. Server tests use [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) with the real migrations applied, so SQL is tested without touching Supabase. Tests run in the `America/Toronto` timezone.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), e.g. `feat(sync): pull events from Google Calendar`.

# GSB MBA27 – Summer 2026

A web application for the Stanford GSB MBA Class of 2027 to track, coordinate, and explore summer locations.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Supabase** (PostgreSQL + Auth + Storage)
- **Mapbox GL JS** (interactive map + geocoding)
- **Tailwind CSS v4**
- **Vercel** (deployment)

## Setup

### 1. Clone & install

```bash
git clone git@github.com:aewurm98/gsb27-summer-2026.git
cd gsb27-summer-2026
nvm use 22
npm install
```

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — for seed script only (keep secret, never commit)
- `NEXT_PUBLIC_MAPBOX_TOKEN` — from mapbox.com → Access tokens

### 3. Database

Run the SQL migrations in Supabase SQL Editor (in order):
1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_allow_seeded_profiles.sql`

In Supabase **Storage**, create a public bucket named `avatars`.

### 4. Set yourself as admin

After signing in with your Stanford email for the first time, run in Supabase SQL editor:

```sql
UPDATE profiles SET is_admin = true WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'alexwurm@stanford.edu'
);
```

### 5. Seed classmate data

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_MAPBOX_TOKEN=... \
  npx ts-node --esm scripts/seed.ts
```

Reads `../GSB MBA27 Summer 2026 Directory .xlsx`, geocodes each city via Mapbox, and inserts profiles + locations into Supabase.

### 6. Run locally

```bash
npm run dev
```

## Auth setup in Supabase

In Supabase **Auth → Settings**:
- Enable **Magic Link** (Email)
- Set **Site URL** to `http://localhost:3000` for dev
- Add redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://your-vercel-url.vercel.app/auth/callback`

## Deployment

Connect this GitHub repo to Vercel. Add all env vars (excluding `SUPABASE_SERVICE_ROLE_KEY` — dev/seed only). Vercel auto-deploys on push to `main`.

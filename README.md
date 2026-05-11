# GSB MBA27 – Summer 2026

A web application for the Stanford GSB MBA Class of 2027 to track, coordinate, and explore summer locations.

## Features

- **Interactive map** — week-by-week slider (Jun 1 – Sep 14) showing where classmates are; click a marker to see who's there and what they're working on. Week index persists across page navigations.
- **Directory** — searchable/filterable grid of classmates with hosting and visiting badges, location summaries, and travel interest tags.
- **Profile** — each classmate enters their summer experiences (internship, travel, etc.) with company/role, cities, and dates. Hosting availability and open-to-visit flags let people coordinate couch-surfing.
- **Treks** — admin-curated group trips; classmates mark interest. Travel interests aggregate into the admin Insights tab to surface natural trek candidates.
- **Onboarding gate** — new sign-ins are routed to profile completion before accessing the app.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Supabase** (PostgreSQL + Auth + Storage)
- **Mapbox GL JS** (interactive map + geocoding)
- **Tailwind CSS v4**
- **Zustand** (map week-index state)
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
3. `supabase/migrations/003_summer_profile_fields.sql`

Migration 003 drops the pre-MBA columns (`pre_mba_company`, `pre_mba_role`, `linkedin_url`, `bio`) and adds summer-focused fields:

| Table | New columns |
|---|---|
| `profiles` | `additional_details`, `can_host`, `hosting_details`, `open_to_visit`, `has_completed_profile` |
| `locations` | `label` ("Summer Internship" \| "Traveling" \| "Visiting family/friends" \| "Other"), `company`, `role` |
| `travel_interests` | `interest_start_date`, `interest_end_date` |

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

> **Note:** Seeded profiles have `has_completed_profile = false` by default. After seeding, run:
> ```sql
> UPDATE profiles SET has_completed_profile = true;
> ```
> to let all seeded users access the app without hitting the onboarding gate.

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

## Key files

| File | Purpose |
|---|---|
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/utils.ts` | Date formatting, overlap detection, avatar helpers |
| `src/lib/map-store.ts` | Zustand store for persisting map week index |
| `src/proxy.ts` | Next.js 16 middleware — auth gate + injects `x-pathname` header |
| `src/app/(main)/layout.tsx` | Server layout — profile fetch + onboarding redirect |
| `src/components/profile/ProfileEditForm.tsx` | Full profile edit form |
| `src/components/map/MapClient.tsx` | Mapbox map with week slider + city popups |
| `src/components/directory/DirectoryClient.tsx` | Directory with search/filter |
| `src/components/admin/AdminClient.tsx` | Admin dashboard, CSV export, trek insights |
| `supabase/migrations/` | SQL migrations (run in order) |

## Deployment

Connect this GitHub repo to Vercel. Add all env vars (excluding `SUPABASE_SERVICE_ROLE_KEY` — dev/seed only). Vercel auto-deploys on push to `main`.

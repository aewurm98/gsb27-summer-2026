# GSB27 Summer 2026 — Fresh Chat Handoff

Paste everything below this line into a new Claude Code chat.

---

## Project snapshot (as of 2026-06-09)

Next.js 15 + Supabase + Mapbox GL app for Stanford MBA27 classmates to share summer 2026 locations and coordinate group trips.

**Project root:**
```
/Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026/
```

**Key facts:**
- Supabase project ID: `rswczmdvmbugpunfumyf` (region: us-west-1, status: ACTIVE_HEALTHY)
- Vercel deployment: auto-deploys on push to `origin/main`
- Dev server: `npm run dev -- --port 3001` (port 3000 is permanently occupied)
- Turbopack compile is slow (~10–15 min) on this machine due to low RAM — never kill mid-compile
- **141 profiles** currently in the directory (all classmates have been imported)
- Supabase MCP is available — use project ID `rswczmdvmbugpunfumyf` for all MCP calls

**Node version requirement:** Always use Node 22 for scripts that touch Supabase:
```bash
~/.nvm/versions/node/v22.16.0/bin/node --import ./node_modules/tsx/dist/esm/index.cjs scripts/<name>.ts
```
Node 16 crashes (no `Headers`), Node 20 crashes (no native WebSocket). Node 22 works.

Pass env vars explicitly since `--env-file` behaves differently across versions:
```bash
NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2) \
SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2) \
~/.nvm/versions/node/v22.16.0/bin/node --import ./node_modules/tsx/dist/esm/index.cjs scripts/migrate-remaining.ts
```

---

## Directory / profile management

### Adding profiles from an updated Excel file

The Excel (`GSB MBA27 Summer 2026 Directory  (1).xlsx`, sheet `Classmate Details`) has classmate travel data starting at **row 6, column B** (name), columns C–K (3 city stops × city/start/end).

**Standard seed script** — non-destructive, handles most cases:
```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
~/.nvm/versions/node/v22.16.0/bin/node --import ./node_modules/tsx/dist/esm/index.cjs \
scripts/seed.ts '/path/to/file.xlsx'
```
- Claimed profiles → never touched
- Unclaimed profiles → only adds missing cities
- New names → created fresh

**For incremental imports** (only a handful of new names): write a targeted script modelled on `scripts/migrate-remaining.ts` rather than running seed.ts blindly. This avoids creating duplicate profiles for name-mismatch rows (see below).

### Name mismatches to watch for

These classmates appear in the Excel under shortened names but exist in the DB under their full names. **Do not create new profiles for them — they already exist:**

| Excel row name | DB full_name | Status |
|---|---|---|
| Tafui Leggard | Tafui Monique Leggard | claimed |
| Ryan Chandra | Ryan Dhruv Chandra | claimed |
| Juanita Ferrer | Juanita Ferrer Escobar | claimed |
| Renato Ricaurte | Renato Ricaurte Cogorno | claimed |

Before running any import, always cross-check new names against the DB:
```sql
-- Via Supabase MCP (project rswczmdvmbugpunfumyf):
SELECT full_name FROM profiles ORDER BY full_name;
```

### Combined-name Excel rows (couples / roommates)

Some Excel rows list two people as one entry. These have been resolved:

| Excel row | Resolution |
|---|---|
| "Alyssa Karbel and Ross gates" | Alyssa's profile exists (claimed). Ross is her SO — `so_name = 'Ross'` is set on her location. No separate profile for Ross. |
| "Grant & Gracie Griffith" | Grant's profile exists. Gracie is his SO — `so_name = 'Gracie'` is set on his location. No separate profile for Gracie. |

If future Excel rows contain combined names, do **not** create a separate profile for the SO. Instead:
1. Find the classmate's profile
2. Update `locations.so_name` on their location row(s)
3. If the SO has no travel stops of their own, no profile is needed

### SO (significant other) data model

SO names live on **`locations.so_name`** (per location row), not on the `profiles` table.
The `profiles` table does **not** have a `so_name` column.

Example — set SO name on a location:
```sql
UPDATE locations SET so_name = 'Ross' WHERE id = '<location-uuid>';
```

### Deleting a profile safely

Always delete locations before the profile (to avoid FK constraint issues):
```sql
DELETE FROM locations WHERE profile_id = '<profile-uuid>';
DELETE FROM profiles WHERE id = '<profile-uuid>';
```

Only delete unclaimed profiles (`user_id IS NULL`). Verify first:
```sql
SELECT id, full_name, user_id IS NOT NULL as claimed FROM profiles WHERE full_name = 'Name Here';
```

---

## City geo data

Both `scripts/seed.ts` and `src/app/api/admin/import-profiles/route.ts` contain a `CITY_GEO` lookup table. Keep them in sync when adding cities.

**"Stanford" maps to Palo Alto** — Stanford University is within Palo Alto. When the Excel lists "Stanford" as a city, store the location as city `'Palo Alto'` using the Palo Alto coordinates `(37.4419, -122.1430)`.

City aliases (normalized before geo lookup):
```
'Palo Alto/ San Francisco' → 'Palo Alto'
'SF' → 'San Francisco'
'NYC' → 'New York'
'LA' → 'Los Angeles'
'DC' → 'Washington DC'
'Stanford' → use Palo Alto geo, store as 'Palo Alto'
```

---

## Git / deploy workflow

```bash
# Verify clean state
git status
git log --oneline -5

# Stage only relevant files (never stage .claude/, *.md planning docs, or .env*)
git add src/   # or specific files
git commit -m "Description"
git push origin main   # triggers Vercel auto-deploy
```

Untracked files that should stay untracked (not committed):
- `.claude/` — Claude Code session data
- `FRESH_CHAT_PROMPT.md`, `PLAN.md`, `FIXES_PLAN.md` — planning docs
- `scripts/migrate-remaining.ts` — already committed (one-time migration)

---

## Schema quick reference

**`profiles`** — one row per classmate
- `id`, `full_name`, `email`, `user_id` (null = unclaimed), `is_admin`, `has_completed_profile`
- `photo_url`, `additional_details`, `can_host`, `hosting_details`, `open_to_visit`

**`locations`** — travel stops, linked to profiles
- `profile_id`, `city`, `city_ascii`, `state`, `country`, `lat`, `lng`
- `start_date`, `end_date`, `sort_order`, `label`, `company`, `role`
- `so_name` — SO's first name, shown alongside the classmate's pin on the map

**`travel_interests`** — desired-destination signals
- `profile_id`, `destination`, `interest_start_date`, `interest_end_date`, `open_to_others`

**`treks`** — admin/classmate-organized group trips
- `title`, `destination_city`, `start_date`, `end_date`, `leader_id`, `is_admin_trek`

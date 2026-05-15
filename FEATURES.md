# GSB27 Summer 2026 — Feature Roadmap & PRD

> **Living document.** Updated as each phase is implemented.  
> Project root: `/Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026/`

---

## Current State (as of 2026-05-14)

### Database Tables
| Table | Key columns |
|---|---|
| `profiles` | id, user_id, email, full_name, photo_url, section (Hometown), additional_details, can_host, hosting_details, open_to_visit, has_completed_profile, is_admin |
| `locations` | id, profile_id, city, city_ascii, state, country, lat, lng, start_date, end_date, sort_order, label, company, role, so_name |
| `travel_interests` | id, profile_id, destination_city, destination_country, destination_lat, destination_lng, notes, interest_start_date, interest_end_date |
| `treks` | id, title, destination_city, destination_country, destination_lat, destination_lng, proposed_start, proposed_end, description, created_by |
| `trek_interests` | id, trek_id, profile_id, status ('interested'/'confirmed'/'declined') |

### Key files
| File | Purpose |
|---|---|
| `src/lib/types.ts` | TypeScript interfaces — source of truth |
| `src/lib/utils.ts` | `getLocationAtWeek`, `getOverlappingClassmates`, `formatDateRange`, `avatarColor`, `getInitials`, `getSummerWeeks` |
| `src/components/directory/DirectoryClient.tsx` | Directory grid, Fuse.js search, city/week filters |
| `src/components/profile/ProfileEditForm.tsx` | Edit form with location drafts, travel interests |
| `src/components/treks/TreksClient.tsx` | Trek list, interest toggling, admin create form |
| `src/components/admin/AdminClient.tsx` | Admin tabs: classmates, profiles, treks, insights |
| `src/components/map/MapClient.tsx` | Mapbox GL JS week-by-week map |
| `scripts/seed.ts` | Excel → Supabase seed (preserves so_name) |

### Existing migrations
- `001_initial.sql` — base schema
- `002_allow_seeded_profiles.sql` — RLS for seeded profiles
- `003_summer_profile_fields.sql` — hosting/visit fields
- `004_profile_email.sql` — email column + claim trigger

---

## Phase 0 — Fix Photo Upload ✅ (pending execution)

### Problem
`avatars` storage bucket exists and is public, but `storage.objects` has **zero RLS policies**.  
Supabase storage requires explicit RLS policies even when the bucket is public.

### Fix: SQL migration `005_storage_rls.sql`
```sql
-- Allow authenticated users to upload their own avatar
create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to read avatars (public bucket)
create policy "Anyone can view avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');
```

### Files changed
- `supabase/migrations/005_storage_rls.sql` — new migration (applied via Supabase Dashboard SQL editor)

---

## Phase 1 — Data Enrichment

### Goal
Capture richer preference data that powers matching (Phase 2).  
Add activity tags, travel style, and group size preferences to profiles;  
add trip intent to travel interests.

### 1a. Database schema — migration `006_enrichment_fields.sql`

```sql
-- Profiles: travel style preferences
alter table profiles
  add column if not exists activity_tags text[] default '{}',
  add column if not exists trip_style text check (trip_style in ('adventure','cultural','relaxation','foodie','nightlife','mixed')) default null,
  add column if not exists group_size_pref text check (group_size_pref in ('solo','small (2-4)','medium (5-10)','large (10+)','any')) default null;

-- Travel interests: trip intent
alter table travel_interests
  add column if not exists intent text check (intent in ('working remotely','tourism','visiting family','conference','open')) default null;

-- Treks: enrichment for filtering and display
alter table treks
  add column if not exists activity_tags text[] default '{}',
  add column if not exists cost_tier text check (cost_tier in ('budget','moderate','premium')) default null,
  add column if not exists max_group_size int default null;
```

### 1b. TypeScript types — `src/lib/types.ts`

Add to `Profile`:
```ts
activity_tags: string[]
trip_style: 'adventure' | 'cultural' | 'relaxation' | 'foodie' | 'nightlife' | 'mixed' | null
group_size_pref: 'solo' | 'small (2-4)' | 'medium (5-10)' | 'large (10+)' | 'any' | null
```

Add to `TravelInterest`:
```ts
intent: 'working remotely' | 'tourism' | 'visiting family' | 'conference' | 'open' | null
```

Add to `Trek`:
```ts
activity_tags: string[]
cost_tier: 'budget' | 'moderate' | 'premium' | null
max_group_size: number | null
```

### 1c. ProfileEditForm — new preference section

Add a "Travel Preferences" card between "About me" and "Summer plans" sections.

**Activity tags** — multi-select toggle chips:
```
['hiking', 'surfing', 'skiing', 'cycling', 'running', 'yoga',
 'food & wine', 'nightlife', 'art & culture', 'history', 'beaches',
 'mountains', 'cities', 'road trips', 'backpacking', 'luxury']
```

**Trip style** — single-select radio pills: adventure / cultural / relaxation / foodie / nightlife / mixed

**Group size preference** — single-select radio pills: solo / small (2-4) / medium (5-10) / large (10+) / any

**Travel interest `intent`** — add a small select dropdown next to each interest destination:
`working remotely | tourism | visiting family | conference | open`

### 1d. Supabase upsert in ProfileEditForm
Extend the `handleSave` function to include the three new profile fields.  
For travel interests, extend the insert payload to include `intent`.

---

## Phase 2 — Matching Engine + Directory UX

### Goal
Sort directory by match score for the logged-in user; show why they match.

### 2a. `getMatchScore` — `src/lib/utils.ts`

```ts
export interface MatchResult {
  score: number                  // 0–100
  reasons: string[]              // human-readable chips
}

export function getMatchScore(
  myProfile: Profile & { locations: Location[]; travel_interests: TravelInterest[] },
  theirProfile: Profile & { locations: Location[]; travel_interests: TravelInterest[] }
): MatchResult {
  let score = 0
  const reasons: string[] = []

  // 1. Co-location overlap (up to 40 pts)
  //    +5 per overlapping week, capped at 40
  const overlappingWeeks = getOverlappingWeekCount(myProfile.locations, theirProfile.locations)
  if (overlappingWeeks > 0) {
    const pts = Math.min(40, overlappingWeeks * 5)
    score += pts
    const weeks = getSummerWeeks()
    const sharedCity = getFirstSharedCity(myProfile.locations, theirProfile.locations)
    reasons.push(`${overlappingWeeks}w overlap in ${sharedCity}`)
  }

  // 2. Shared travel interests (up to 30 pts)
  //    +10 per matching destination city
  const myInterestCities = new Set(myProfile.travel_interests.map(t => t.destination_city.toLowerCase()))
  const sharedInterests = theirProfile.travel_interests.filter(t =>
    myInterestCities.has(t.destination_city.toLowerCase())
  )
  if (sharedInterests.length > 0) {
    score += Math.min(30, sharedInterests.length * 10)
    reasons.push(`Both want to visit ${sharedInterests.slice(0,2).map(t=>t.destination_city).join(', ')}`)
  }

  // 3. Shared activity tags (up to 20 pts)
  //    +4 per shared tag, capped at 20
  const myTags = new Set(myProfile.activity_tags ?? [])
  const sharedTags = (theirProfile.activity_tags ?? []).filter(t => myTags.has(t))
  if (sharedTags.length > 0) {
    score += Math.min(20, sharedTags.length * 4)
    reasons.push(`Both into ${sharedTags.slice(0,3).join(', ')}`)
  }

  // 4. Trip style match (10 pts)
  if (myProfile.trip_style && myProfile.trip_style === theirProfile.trip_style) {
    score += 10
    reasons.push(`Same travel style (${myProfile.trip_style})`)
  }

  return { score: Math.min(100, score), reasons }
}
```

Helper: `getOverlappingWeekCount(myLocs, theirLocs): number` — counts weeks where both are in same city.
Helper: `getFirstSharedCity(myLocs, theirLocs): string` — returns city name of first shared week.

### 2b. DirectoryClient — sort + filter enhancements

**New props:**
```ts
interface Props {
  profiles: FullProfile[]
  myProfileId: string | null
  myProfile: (Profile & { locations: Location[]; travel_interests: TravelInterest[] }) | null  // NEW
}
```

**New state:**
```ts
const [sortBy, setSortBy] = useState<'match' | 'alpha'>('match')
const [tagFilter, setTagFilter] = useState<string[]>([])
```

**Sorting logic** (in `useMemo`):
- If `myProfile` exists and `sortBy === 'match'`: compute `getMatchScore` for each profile, sort descending by score
- Otherwise: sort alphabetically

**Activity tag filter pills** — horizontal scrollable chip row above the grid:
- Show all unique tags across all profiles
- Active = filled chip, inactive = outlined
- Multi-select: filter to profiles sharing any selected tag

**Match score display on cards:**
- If `myProfile` exists and `score > 0`: show a small `✦ {score}` badge in card top-right
- Show top 1–2 reason chips below the location summary

**Sort toggle** — small segmented control: "Best match | A–Z"

### 2c. Directory server page — `src/app/(main)/directory/page.tsx`
Pass `myProfile` (full profile with locations + travel_interests) to `DirectoryClient`.

---

## Phase 3 — Trek Enhancements

### Goal
Auto-suggest treks from classmate interest clusters; show activity tags on trek cards.

### 3a. "Suggested treks" section — `TreksClient.tsx`

Computed server-side or client-side from travel interests:
- Group travel_interests by destination_city
- If 3+ classmates share a destination → show as "Suggested" card
- Cards show: city name, # interested, who's going, "Create trek" button (admin only)

Implementation: Pass `suggestedDestinations` as a prop:
```ts
interface SuggestedDestination {
  city: string
  country: string
  lat: number | null
  lng: number | null
  interestedProfiles: Array<{ id: string; full_name: string; photo_url: string | null }>
}
```

Compute in `src/app/(main)/treks/page.tsx` from all profiles' travel_interests.

### 3b. Activity tags on trek cards

**Create form** — add tag selector (same chips UI as profile):
```ts
const ACTIVITY_TAGS = ['hiking','surfing','skiing','cycling','running','yoga',
 'food & wine','nightlife','art & culture','history','beaches',
 'mountains','cities','road trips','backpacking','luxury']
```

**Trek card display** — show up to 3 activity tag pills below description.

**"Matches your interests" indicator** — if the logged-in user's `activity_tags` overlaps with trek's `activity_tags`, show a small `✦ Match` badge.

### 3c. Cost tier + max group size on trek cards
Display as metadata icons:
- `cost_tier`: 💰 / 💰💰 / 💰💰💰 (budget/moderate/premium)
- `max_group_size`: 👥 Max {n}

---

## Phase 4 — Admin Analytics

### Goal
Give admins a richer insights dashboard to understand classmate distribution and engagement.

### 4a. Weekly city density heatmap — `AdminClient.tsx` Insights tab

Data structure: `weeks × cities` matrix where value = # classmates in that city that week.

```ts
// Compute in useMemo
const weekCityMatrix = weeks.map(w => ({
  label: w.label,
  dateLabel: w.dateLabel,
  cities: topCities.map(city => ({
    city,
    count: profiles.filter(p => {
      const loc = getLocationAtWeek(p.locations ?? [], w.index)
      return loc?.city === city
    }).length
  }))
}))
```

Display as a scrollable table: rows = weeks, columns = top 10 cities, cells = count with color intensity.

### 4b. Top destinations bar chart
Already exists as a table. Enhance with:
- Visual bar width proportional to count (already done)
- Add "Create trek" shortcut button next to rows with 3+ interested classmates

### 4c. Co-location matrix
For the top N cities (configurable, default 8):
- Show classmate names grouped by city
- Visual timeline: which weeks each person is in that city

Display as: city accordion → expandable list of classmates + week badges.

### 4d. Data completeness tracker
Show a summary table: for each classmate, what % of profile is complete.

Completeness score:
- Has locations: 30%
- Has travel interests: 20%
- Has photo: 15%
- Has section (hometown): 10%
- Has additional_details: 10%
- Has can_host / open_to_visit set: 10%
- Has activity_tags (Phase 1): 5%

Display as a progress bar per classmate, sortable by completeness.

---

## Implementation Order

| Phase | Status | Notes |
|---|---|---|
| 0 — Photo upload fix | ✅ Done | Migration 005_storage_rls.sql applied |
| 1a — DB enrichment | ✅ Done | Migration 006_enrichment_fields.sql applied |
| 1b — Types update | ✅ Done | types.ts: activity_tags, trip_style, group_size_pref, intent, trek fields |
| 1c/d — Profile form | ✅ Done | ProfileEditForm.tsx: tag chips, style pills, group size, intent dropdown |
| 2a — getMatchScore | ✅ Done | utils.ts: co-location (40pt) + interests (30pt) + tags (20pt) + style (10pt) |
| 2b/c — Directory UX | ✅ Done | DirectoryClient.tsx: match sort, tag filters, score badges, reason chips |
| 3a — Suggested treks | ✅ Done | treks/page.tsx + TreksClient.tsx: auto-suggest from 3+ shared interests |
| 3b/c — Trek enrich | ✅ Done | TreksClient.tsx: activity_tags, cost_tier, max_group_size on create + cards |
| 4a/b — Heatmap + destinations | ✅ Done | AdminClient.tsx insights tab: destinations, weekly heatmap |
| 4c/d — Completeness | ✅ Done | AdminClient.tsx completeness sub-tab with progress bars |

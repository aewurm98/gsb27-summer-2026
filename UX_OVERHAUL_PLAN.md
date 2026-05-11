# GSB Summer '26 — UX Overhaul Implementation Plan

## Context

**Repo**: `aewurm98/gsb27-summer-2026`, branch `main`
**Working dir**: `/Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026-fix`
**Stack**: Next.js 16.2.6 (App Router), Supabase, Mapbox GL, Tailwind CSS v4, TypeScript
**Auth**: Google OAuth via Supabase (working), restricted to @stanford.edu
**Theme**: Stanford palette — cardinal red `#8C1515` primary, warm charcoal `#1C1714` dark mode background

The app is a summer travel coordination tool for the Stanford GSB MBA Class of 2027. Classmates enter their summer itineraries and connect around shared locations and group trips ("treks"). It is deployed on Vercel at `https://gsb27-summer-2026.vercel.app`.

---

## Critical Technical Constraints

- **Next.js 16**: Middleware file is `src/proxy.ts` (not `middleware.ts`); the exported function must also be named `proxy`
- **Next.js 16**: `ssr: false` with `next/dynamic` is only allowed inside `'use client'` components — see the `MapWrapper.tsx` pattern
- **Tailwind v4**: Uses `@import "tailwindcss"` + `@theme inline {}` in `globals.css`; there is no `tailwind.config.js`
- **`cookies()` from `next/headers` is async** in Next.js 16 — must `await cookies()`
- **Supabase SSR**: Uses `@supabase/ssr` with `createServerClient` (server) and `createBrowserClient` (client) — see `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`
- **TypeScript strict mode**: All flatMap branches must return identical types; joined Supabase relations may be `| undefined`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/utils.ts` | Helper functions (date formatting, overlap detection, avatar colors) |
| `src/proxy.ts` | Next.js 16 middleware (auth + profile completion gate) |
| `src/app/(main)/layout.tsx` | Server layout — fetches profile, renders Navbar |
| `src/app/(main)/profile/edit/page.tsx` | Profile edit page (server wrapper) |
| `src/components/profile/ProfileEditForm.tsx` | Profile edit form — biggest rewrite target |
| `src/components/layout/Navbar.tsx` | Nav bar with Stanford tree SVG logo |
| `src/components/map/MapClient.tsx` | Mapbox map with week slider |
| `src/app/(main)/map/MapWrapper.tsx` | `'use client'` wrapper that owns `dynamic(ssr:false)` |
| `src/components/directory/DirectoryClient.tsx` | Directory with search/filter |
| `src/app/(main)/profile/[id]/page.tsx` | Public profile view |
| `src/components/treks/TreksClient.tsx` | Treks page |
| `src/components/admin/AdminClient.tsx` | Admin dashboard + CSV export |
| `src/app/globals.css` | Stanford theme CSS variables |
| `supabase/migrations/001_initial.sql` | Current schema (reference) |
| `next.config.ts` | Image remote patterns for Supabase + Mapbox |

---

## Current Schema (001_initial.sql — for reference)

```sql
profiles: id, user_id, full_name, linkedin_url, photo_url, bio, section,
          pre_mba_company, pre_mba_role, is_admin, created_at, updated_at

locations: id, profile_id, city, city_ascii, state, country, lat, lng,
           start_date, end_date, sort_order, created_at

travel_interests: id, profile_id, destination_city, destination_country,
                  destination_lat, destination_lng, notes, created_at

treks: id, title, destination_city, destination_country, destination_lat,
       destination_lng, proposed_start, proposed_end, description, created_by, created_at

trek_interests: id, trek_id, profile_id, status ('interested'|'confirmed'|'declined'), created_at
```

---

## Phase 1: Database Migration — New Profile Fields

Create `supabase/migrations/002_summer_profile_fields.sql` and run it in the Supabase SQL Editor.

```sql
-- Remove pre-MBA / irrelevant columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pre_mba_company;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pre_mba_role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS linkedin_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS bio;

-- Add summer-relevant profile columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS additional_details text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_host boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hosting_details text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS open_to_visit boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_completed_profile boolean NOT NULL DEFAULT false;

-- Add experience metadata to locations (each location is now a "summer experience")
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS label text;    -- "Summer Internship", "Traveling", "Visiting family", "Other"
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS company text;  -- optional
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS role text;     -- optional

-- Add date range to travel interests (for trek coordination)
ALTER TABLE public.travel_interests ADD COLUMN IF NOT EXISTS interest_start_date date;
ALTER TABLE public.travel_interests ADD COLUMN IF NOT EXISTS interest_end_date date;
```

### Update `src/lib/types.ts`

Replace the entire file contents:

```typescript
export interface Profile {
  id: string
  user_id: string
  full_name: string
  photo_url: string | null
  section: string | null
  additional_details: string | null   // replaces bio
  can_host: boolean
  hosting_details: string | null
  open_to_visit: boolean
  has_completed_profile: boolean
  is_admin: boolean
  created_at: string
  updated_at: string
  locations?: Location[]
  travel_interests?: TravelInterest[]
}

export interface Location {
  id: string
  profile_id: string
  city: string
  city_ascii: string | null
  state: string | null
  country: string
  lat: number
  lng: number
  start_date: string | null
  end_date: string | null
  sort_order: number
  label: string | null        // NEW: "Summer Internship", "Traveling", etc.
  company: string | null      // NEW: optional
  role: string | null         // NEW: optional
  created_at: string
}

export interface TravelInterest {
  id: string
  profile_id: string
  destination_city: string
  destination_country: string
  destination_lat: number | null
  destination_lng: number | null
  notes: string | null
  interest_start_date: string | null   // NEW
  interest_end_date: string | null     // NEW
  created_at: string
}

export interface Trek {
  id: string
  title: string
  destination_city: string
  destination_country: string
  destination_lat: number | null
  destination_lng: number | null
  proposed_start: string | null
  proposed_end: string | null
  description: string | null
  created_by: string
  created_at: string
  trek_interests?: TrekInterest[]
}

export interface TrekInterest {
  id: string
  trek_id: string
  profile_id: string
  status: 'interested' | 'confirmed' | 'declined'
  created_at: string
  profile?: Pick<Profile, 'id' | 'full_name' | 'photo_url'>
}

export interface MapboxFeature {
  id: string
  place_name: string
  center: [number, number]
  context?: Array<{ id: string; text: string }>
  place_type: string[]
  text: string
  properties: Record<string, string>
}

// Summer 2026 window
export const SUMMER_START = new Date('2026-06-01')
export const SUMMER_END   = new Date('2026-09-14')
export const SUMMER_WEEKS = 16
```

**Remove all references to deleted fields** across the codebase:
- `pre_mba_company`, `pre_mba_role`, `linkedin_url`, `bio` appear in:
  - `src/components/profile/ProfileEditForm.tsx`
  - `src/app/(main)/profile/[id]/page.tsx`
  - `src/components/directory/DirectoryClient.tsx`
  - `src/components/admin/AdminClient.tsx`
  - `src/app/(main)/map/page.tsx` (Supabase `.select()` query)
  - `src/components/map/MapClient.tsx` (MapProfile type)
  - `src/app/(main)/map/MapWrapper.tsx` (MapProfile type)

---

## Phase 2: Onboarding Gate — Force Profile Completion

New users who sign in via Google have an auto-created profile stub with `has_completed_profile = false` (set by the Supabase trigger). They must fill out their profile before accessing the directory, map, or treks.

### Update `src/app/(main)/layout.tsx`

After the existing profile query, add a redirect for incomplete profiles:

```typescript
// Existing code fetches profile...
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', user.id)
  .single()

// ADD THIS: Gate incomplete profiles to /profile/edit
const isEditingProfile = /* check current path — pass as prop or use headers() */
if (profile && !profile.has_completed_profile) {
  const headersList = await headers()  // import { headers } from 'next/headers'
  const pathname = headersList.get('x-invoke-path') ?? ''
  if (!pathname.startsWith('/profile/edit')) {
    redirect('/profile/edit')
  }
}
```

**Simpler alternative** (recommended): Pass a `isNewUser` prop to the main layout children and handle in individual pages. Or, in `src/app/(main)/profile/edit/page.tsx`, check `has_completed_profile` and show a welcome banner if false.

### Update `src/components/profile/ProfileEditForm.tsx` — Save handler

When saving for the first time, set `has_completed_profile = true`:

```typescript
// In handleSave(), in the upsert object:
has_completed_profile: true,
```

After first save, redirect to `/map` with a success toast: "Welcome! Your profile is live — see where your classmates are headed."

### Welcome Banner

Show at the top of the profile edit page when `!profile.has_completed_profile`:

```tsx
{!profile?.has_completed_profile && (
  <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5 mb-2">
    <h2 className="font-semibold text-primary mb-1">Welcome to GSB Summer '26!</h2>
    <p className="text-sm text-muted-foreground">
      Fill out your summer plans below. Once you save, you'll be able to see
      where all your classmates are headed this summer.
    </p>
  </div>
)}
```

---

## Phase 3: Profile Edit Form — Full Rewrite

**File**: `src/components/profile/ProfileEditForm.tsx`

### Section 1: "About Me" (simplified)

Keep:
- Photo upload (existing implementation is good)
- Full name
- GSB Section

Remove:
- Pre-MBA company
- Pre-MBA role
- LinkedIn URL
- Bio

Add:
```tsx
<div className="space-y-1 sm:col-span-2">
  <label className="text-xs font-medium text-muted-foreground">Additional details</label>
  <textarea
    value={additionalDetails}
    onChange={e => setAdditionalDetails(e.target.value)}
    rows={3}
    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
    placeholder="Anything your classmates should know — where in the city you'll be, best way to reach you, fun plans, etc."
  />
</div>
```

### Section 2: "Hosting & Visiting" (new section)

```tsx
<section className="rounded-2xl border border-border bg-card p-6 space-y-4">
  <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Hosting & Visiting</h2>

  {/* Can host toggle */}
  <div className="space-y-2">
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={canHost} onChange={e => setCanHost(e.target.checked)}
        className="w-4 h-4 rounded accent-primary" />
      <span className="text-sm font-medium">I can host visiting classmates</span>
    </label>
    {canHost && (
      <input
        value={hostingDetails}
        onChange={e => setHostingDetails(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Guest bed, air mattress, couch — let them know what you've got"
      />
    )}
  </div>

  {/* Open to visit toggle */}
  <label className="flex items-center gap-3 cursor-pointer">
    <input type="checkbox" checked={openToVisit} onChange={e => setOpenToVisit(e.target.checked)}
      className="w-4 h-4 rounded accent-primary" />
    <span className="text-sm font-medium">I'm open to visiting / couch-surfing with classmates</span>
  </label>
</section>
```

### Section 3: "Summer Plans" (replaces "Summer Itinerary")

- Rename "Stop N" → use `label` field as the card title (default "Experience N")
- Each card has:
  1. **Label** — dropdown: "Summer Internship" | "Traveling" | "Visiting family/friends" | "Other"
  2. **Company** — text input, only shown when label = "Summer Internship" or "Other"
  3. **Role** — text input, only shown when label = "Summer Internship" or "Other"
  4. **City** — CityAutocomplete (existing)
  5. **Start date** / **End date** — date pickers (existing)
- Button: "Add experience" (not "Add stop")
- Remove the 5-experience limit (raise to 10)
- Remove GripVertical drag handle (reordering UX is confusing for most users)

```tsx
// LocationDraft interface additions:
interface LocationDraft {
  // ... existing fields ...
  label: string      // NEW
  company: string    // NEW
  role: string       // NEW
}

// Default factory:
function newLocationDraft(order: number): LocationDraft {
  return {
    city: '', city_ascii: null, state: null, country: 'United States',
    lat: null, lng: null, start_date: '', end_date: '', sort_order: order,
    label: 'Summer Internship', company: '', role: ''  // NEW
  }
}
```

### Section 4: "Travel Interests" (enhanced)

Each interest card adds optional date range:
```tsx
<div className="grid grid-cols-2 gap-2 mt-2">
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">Interested from (optional)</label>
    <input type="date" value={interest.interest_start_date}
      onChange={e => updateInterest(i, { interest_start_date: e.target.value })}
      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm ..." />
  </div>
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">To (optional)</label>
    <input type="date" value={interest.interest_end_date}
      onChange={e => updateInterest(i, { interest_end_date: e.target.value })}
      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm ..." />
  </div>
</div>
```

Update `InterestDraft` interface to include `interest_start_date: string` and `interest_end_date: string`.

---

## Phase 4: Navbar Fixes

**File**: `src/components/layout/Navbar.tsx`

### Fix 1: Add "My Profile" as a top-level nav link

```typescript
import { Map, Users, Plane, Shield, User, LogOut, Sun, Moon, Monitor } from 'lucide-react'

const NAV_LINKS = [
  { href: '/map',          label: 'Map',       icon: Map   },
  { href: '/directory',    label: 'Directory', icon: Users },
  { href: '/treks',        label: 'Treks',     icon: Plane },
  { href: '/profile/edit', label: 'Profile',   icon: User  },  // ADD THIS
]
```

### Fix 2: Avatar — replace "?" with person silhouette

```tsx
// Change this:
const initials = profile?.full_name?.split(' ').slice(0, 2).map(n => n[0]).join('') ?? '?'

// To this:
const initials = profile?.full_name?.split(' ').slice(0, 2).map(n => n[0]).join('') ?? null

// In the avatar button:
<div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold">
  {initials ?? <User size={14} />}
</div>
```

### Fix 3: Fix "Loading…" text in dropdown

```tsx
// Change:
<p className="text-xs font-medium text-foreground truncate">{profile?.full_name ?? 'Loading…'}</p>
<p className="text-xs text-muted-foreground truncate">{profile?.section ? `Section ${profile.section}` : 'GSB MBA27'}</p>

// To:
<p className="text-xs font-medium text-foreground truncate">{profile?.full_name ?? 'New User'}</p>
<p className="text-xs text-muted-foreground truncate">{profile?.section ?? 'GSB MBA27'}</p>
```

---

## Phase 5: Map Improvements

### Fix 1: Persist week index across tab switches

**Approach**: Store `weekIndex` in a Zustand store or React Context that lives in `src/app/(main)/layout.tsx`. This persists the value across page navigations within the `(main)` group.

Create `src/lib/map-store.ts`:

```typescript
// Using a simple module-level variable (simplest approach for this use case)
// Or use Zustand: npm install zustand

import { create } from 'zustand'

interface MapState {
  weekIndex: number
  setWeekIndex: (i: number) => void
}

export const useMapStore = create<MapState>((set) => ({
  weekIndex: 0,
  setWeekIndex: (weekIndex) => set({ weekIndex }),
}))
```

In `src/components/map/MapClient.tsx`, replace:
```typescript
const [weekIndex, setWeekIndex] = useState(0)
```
With:
```typescript
const { weekIndex, setWeekIndex } = useMapStore()
```

Install zustand: `npm install zustand` in the project directory.

### Fix 2: Add calendar popup for week selection

**File**: `src/components/map/MapClient.tsx`

Add a week grid popup next to the week label. The grid shows 16 cells (one per summer week), each labeled with the date:

```tsx
const [showWeekPicker, setShowWeekPicker] = useState(false)

// In the week slider panel, next to the week label:
<button
  onClick={() => setShowWeekPicker(p => !p)}
  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
>
  Jump to week
</button>

{showWeekPicker && (
  <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl p-3 shadow-lg z-10">
    <div className="grid grid-cols-4 gap-1">
      {weeks.map((week, i) => (
        <button
          key={i}
          onClick={() => { setWeekIndex(i); setShowWeekPicker(false) }}
          className={`px-2 py-1.5 rounded-lg text-xs text-left transition ${
            i === weekIndex
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent text-muted-foreground'
          }`}
        >
          <div className="font-medium">W{i + 1}</div>
          <div className="opacity-70">{week.dateLabel.split('–')[0].trim()}</div>
        </button>
      ))}
    </div>
  </div>
)}
```

### Fix 3: Show experience details in city popups

In the `CityGroup` popup panel (right side when a marker is clicked), show the experience label/company/role for each classmate:

```tsx
// In the profile list inside selectedCity popup:
<div className="min-w-0">
  <p className="text-sm font-medium truncate">{profile.full_name}</p>
  {/* Show their experience at this city */}
  {profile.currentExperience && (
    <p className="text-xs text-muted-foreground truncate">
      {[profile.currentExperience.role, profile.currentExperience.company]
        .filter(Boolean).join(' @ ') || profile.currentExperience.label}
    </p>
  )}
</div>
```

To support this, update the `CityGroup` type and `getLocationAtWeek` to return the full location object (including `label`, `company`, `role`) and pass it through to the MapProfile type.

---

## Phase 6: Directory & Profile View Updates

**File**: `src/components/directory/DirectoryClient.tsx`

- Replace pre-MBA company/role display with summer experiences summary
- Add hosting/visiting badges to profile cards:

```tsx
<div className="flex gap-1 mt-1">
  {p.can_host && (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      🏠 Host
    </span>
  )}
  {p.open_to_visit && (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      ✈️ Visitor
    </span>
  )}
</div>
```

**File**: `src/app/(main)/profile/[id]/page.tsx`

Update the server component to select new fields, and update the UI to show:
- Hosting availability (prominent badge if `can_host`)
- Full summer timeline (all experiences with labels, companies, roles, dates)
- Travel interests with date ranges
- Additional details section (replaces bio)
- Remove LinkedIn link (no longer in schema)

---

## Phase 7: Treks Page — Add Interest Collection CTA

**File**: `src/components/treks/TreksClient.tsx`

The treks feature is **admin-only for creation** (correct). For now, add a prominent CTA when there are no treks:

```tsx
// Replace the "No treks yet — check back soon!" empty state:
<div className="text-center space-y-4 py-12">
  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
    <Plane size={24} className="text-primary" />
  </div>
  <div>
    <h3 className="font-semibold text-lg">Treks coming soon</h3>
    <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
      We're coordinating group trips based on classmate interest.
      Add destinations to your <Link href="/profile/edit" className="text-primary underline underline-offset-2">travel interests</Link> and
      we'll organize treks when we have critical mass.
    </p>
  </div>
</div>
```

---

## Phase 8: Admin Dashboard Updates

**File**: `src/components/admin/AdminClient.tsx`

### Update CSV export

Update `exportCSV()` to use new field names. Remove `pre_mba_company`, `pre_mba_role`, `linkedin_url`. Add:
- `can_host`, `hosting_details`, `open_to_visit`
- Per-location: `label`, `company`, `role`
- Per-interest: `interest_start_date`, `interest_end_date`

### Add Trek Insights section

Add a third tab "Insights" that aggregates `travel_interests` by `destination_city` and shows classmate overlap counts. This lets Alex see natural trek candidates:

```
Tokyo · 12 classmates interested · 8 overlap in July
Barcelona · 9 classmates interested
```

Implementation: server-side aggregation in the admin page query:
```typescript
const { data: interests } = await supabase
  .from('travel_interests')
  .select('destination_city, destination_country, interest_start_date, interest_end_date, profile:profiles(full_name)')
  .order('destination_city')
```

Then group client-side by city and count.

---

## Implementation Order

Execute phases in this order to avoid breaking intermediate states:

1. **Phase 1** — Run SQL migration in Supabase, update `types.ts`, remove deleted field references from all files
2. **Phase 3** — Rewrite `ProfileEditForm.tsx` with new fields and sections
3. **Phase 2** — Add onboarding gate in `layout.tsx` and welcome banner
4. **Phase 4** — Fix Navbar (avatar silhouette, Profile link, Loading text)
5. **Phase 5** — Map improvements (install zustand, persist state, calendar popup)
6. **Phase 6** — Update Directory and profile view for new schema
7. **Phase 7** — Treks empty state CTA
8. **Phase 8** — Admin CSV export update and Trek Insights tab

Commit after each phase. Use `git -C /Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026-fix` for all git commands since the shell's working directory may differ.

---

## Notes on Reading Files

The local filesystem has intermittent disk I/O issues causing `Read` tool timeouts. Use this pattern instead:

```bash
strings "/path/to/file.tsx" 2>&1
# or
cat "/path/to/file.tsx" 2>&1
```

With `dangerouslyDisableSandbox: true` on Bash calls. Write files using `cat > file << 'EOF'` heredocs also with `dangerouslyDisableSandbox: true`.

Git commands must specify the repo path explicitly:
```bash
git -C "/Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026-fix" <command>
```

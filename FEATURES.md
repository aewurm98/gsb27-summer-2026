# GSB27 Summer 2026 — Feature Roadmap & PRD

> **Living document.** Updated as each phase is implemented.  
> Project root: `/Users/alexwurm/Documents/Stanford/Personal/Summer_Travel_Site/gsb27-summer-2026/`

---

## Current State (as of 2026-05-17) — Go-Live Ready

### Database Tables
| Table | Key columns |
|---|---|
| `profiles` | id, user_id, email, full_name, photo_url, section (Hometown), additional_details, can_host, hosting_details, open_to_visit, has_completed_profile, is_admin, is_co_admin, activity_tags, trip_style, group_size_pref, travel_budget, travel_pace |
| `locations` | id, profile_id, city, city_ascii, state, country, lat, lng, start_date, end_date, sort_order, label, company, role, so_name, neighborhood |
| `travel_interests` | id, profile_id, destination_city, destination_country, destination_lat, destination_lng, notes, interest_start_date, interest_end_date, intent |
| `treks` | id, title, destination_city, destination_country, destination_lat, destination_lng, proposed_start, proposed_end, description, activity_tags, cost_tier, max_group_size, created_by |
| `trek_interests` | id, trek_id, profile_id, status ('interested'/'confirmed'/'declined') |

### Key files
| File | Purpose |
|---|---|
| `src/middleware.ts` | Sets `x-pathname` header — prevents infinite redirect for new users with incomplete profiles |
| `src/lib/types.ts` | TypeScript interfaces — source of truth |
| `src/lib/utils.ts` | `getLocationAtWeek` (nomad-aware), `getMatchScore`, `getOverlappingClassmates`, `formatDateRange`, avatar helpers, `getSummerWeeks` |
| `src/components/directory/DirectoryClient.tsx` | Directory grid, Fuse.js search, city/week/tag filters, match scoring |
| `src/components/profile/ProfileEditForm.tsx` | Edit form with location drafts, travel interests, expanded activity tags |
| `src/components/treks/TreksClient.tsx` | Trek list, interest toggling, admin create form, self-serve "I'll lead this" from suggestions |
| `src/components/admin/AdminClient.tsx` | Admin tabs: classmates, profiles, treks, insights (destinations + timeline + heatmap + completeness) |
| `src/components/map/MapClient.tsx` | Mapbox GL JS week-by-week map with resident vs visitor marker distinction |
| `scripts/seed.ts` | Excel → Supabase seed (preserves so_name) |

### Migrations applied
- `001_initial.sql` — base schema
- `002_allow_seeded_profiles.sql` — RLS for seeded profiles
- `003_summer_profile_fields.sql` — hosting/visit fields
- `004_profile_email.sql` — email column + claim trigger
- `005_storage_rls.sql` — avatar storage RLS policies
- `007_travel_preferences_v2.sql` — travel_budget, travel_pace columns
- `008_location_neighborhood.sql` — neighborhood column on locations
- `add_is_co_admin_to_profiles` — is_co_admin boolean on profiles (2026-06-09)

---

## Phase 0 — Photo Upload ✅

Avatar storage RLS policies applied. Users can upload/update their own avatar; public read for all.

---

## Phase 1 — Data Enrichment ✅

Activity tags, trip_style, group_size_pref, travel_budget, travel_pace on profiles.  
Intent on travel_interests. activity_tags, cost_tier, max_group_size on treks.

### Activity tag categories (expanded for go-live)
```
Outdoors:           hiking, backpacking, cycling, rock climbing, surfing, water sports, beaches,
                    snow sports, golf, camping
Food & Drink:       fine dining, street food & markets, wine & cocktails, craft beer, cooking classes
Arts & Culture:     museums & galleries, live music & concerts, theater & performance,
                    historical sites, photography
Wellness:           yoga & pilates, running, fitness & gym, spa & wellness
Sports & Rec:       tennis, pickleball, swimming, volleyball & beach sports
Nightlife & Social: bars & nightlife, sports events, rooftop lounges, festivals & events, comedy shows
Travel:             road trips, sailing & boating
```

---

## Phase 2 — Matching Engine + Directory UX ✅

Match score 0–100 across co-location (40 pts), shared travel interests (30 pts),
shared activity tags (20 pts), trip vibe/budget/pace (15 pts).

Harvey-ball match indicator on directory cards; sort by Best Match or A–Z.
Activity tag filter pills in directory (viewer's own tags highlighted).
Match reasons shown on profile pages.

---

## Phase 3 — Trek Enhancements ✅

### Suggested treks
Destinations with 3+ classmates expressing travel interest auto-appear as suggested treks.
Any logged-in classmate can click **"I'll lead this"** to create a trek from a suggestion
(admin sees "Create trek"). The creator is shown as group lead on the trek card.
Admin retains full management capabilities (member picker, top-level "New trek").

### Trek enrichment
Activity tags, cost tier, max group size on trek cards and create form.

---

## Phase 4 — Admin Analytics ✅

### Insights tab sub-views
- **Destinations** — table of top interest destinations with classmate names
  - **Interest timeline** toggle — week-by-week heatmap of interest concentration for each destination
    (uses interest_start_date/interest_end_date; no-date interests count all summer)
- **Weekly heatmap** — classmates per city per week (top 8 cities)
- **Completeness** — per-classmate data completeness score with sort controls

---

## Phase 5 — Nomad Support ✅ (go-live addition)

### Middleware fix
`src/middleware.ts` sets the `x-pathname` request header consumed by the `(main)` layout.
Without it, new users with `has_completed_profile=false` would be stuck in an infinite
redirect loop even when on `/profile/edit`.

### Smart location resolution
`getLocationAtWeek` now collects ALL locations overlapping a given week and returns the
**shortest-duration** (most specific) match. A 3-day Paris visit correctly wins over a
3-month internship for those specific days, properly surfacing nomadic short stays on
the map and in match scoring.

### Map: resident vs visitor markers
- **Red circle** — profiles whose location label is `Summer Internship` or `Other` (based/residing)
- **Sky-blue circle with ✈** — profiles labeled `Traveling` or `Visiting family/friends`
- Mixed cities: red circle with small ✈ badge showing visitor count
- Legend shown at top-left of the map
- City popup distinguishes visitors with a "✈ visiting" pill

---

---

## Phase 6 — Co-Admin Roles + Trek Invite Emails ✅

### Co-admin accounts (2026-06-09)

New `is_co_admin boolean DEFAULT false` column on `profiles`. Promote a classmate:
```sql
UPDATE profiles SET is_co_admin = true WHERE email = 'classmate@stanford.edu';
```

**Capability matrix:**

| Feature | Super-admin (`is_admin`) | Co-admin (`is_co_admin`) | Regular user |
|---|---|---|---|
| Admin nav link | ✅ | ✅ | — |
| Classmates / Treks / Insights tabs | ✅ | ✅ | — |
| Export CSV | ✅ | ✅ | — |
| Profiles tab (add / edit / batch-import) | ✅ | — | — |
| "New trek" button | ✅ | ✅ | — |
| Member-picker (add anyone to any trek) | ✅ | own treks only | — |
| Invite via email | ✅ | any trek | creator only |

### Trek invite emails (2026-06-09)

Mail icon (✉) on each trek card, visible to the trek creator, co-admins, and super-admins.

**Flow:** select classmates (matching travel interests pre-checked) → preview
templatized email with FOMO mystery line ("N other GSB classmates are already curious
about this trip") → "Open in mail app" fires a `mailto:` with pre-filled
To/Subject/Body linking to `/treks`. Fully free — no backend email service.

---

## Implementation Order

| Phase | Status | Notes |
|---|---|---|
| 0 — Photo upload fix | ✅ Done | Migration 005_storage_rls.sql applied |
| 1a — DB enrichment | ✅ Done | Migrations 007 + 008 applied |
| 1b — Types update | ✅ Done | types.ts: all enrichment fields |
| 1c/d — Profile form | ✅ Done | ProfileEditForm.tsx: expanded tag groups (7 categories, 35 tags), style/pace/budget |
| 2a — getMatchScore | ✅ Done | utils.ts: co-location + interests + tags + vibe/budget/pace |
| 2b/c — Directory UX | ✅ Done | DirectoryClient.tsx: match sort, tag filters, score badges, reason chips |
| 3a — Suggested treks | ✅ Done | treks/page.tsx + TreksClient.tsx: auto-suggest from 3+ shared interests |
| 3b/c — Trek enrich | ✅ Done | TreksClient.tsx: activity_tags, cost_tier, max_group_size on create + cards |
| 4a/b — Heatmap + destinations | ✅ Done | AdminClient.tsx insights tab: destinations table + interest timeline toggle |
| 4c/d — Completeness | ✅ Done | AdminClient.tsx completeness sub-tab with progress bars |
| 5 — Nomad support | ✅ Done | middleware.ts, getLocationAtWeek specificity fix, map visitor markers |
| 5b — Self-serve treks | ✅ Done | Any classmate can lead a suggested trek; group lead shown on cards |
| 6a — Co-admin roles | ✅ Done | is_co_admin flag; full admin read access + trek management, no profile editing |
| 6b — Trek invite emails | ✅ Done | Mailto-based invite panel (BCC, pre-selection, FOMO mystery count, email preview) |
| 7 — Resend email + notifications | 📋 Planned | See TREK_EMAIL_PLAN.md — Resend API invites + subscription notifications |

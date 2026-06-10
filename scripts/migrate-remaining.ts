/**
 * Targeted migration: creates the 6 net-new profiles from the Excel
 * that are not yet in the DB (and avoids duplicating the 4 name-mismatch
 * rows that already exist under their full names).
 *
 * Non-destructive: checks for existing profile by name before inserting.
 * Never touches claimed profiles.
 *
 * Run:
 *   ~/.nvm/versions/node/v20.20.0/bin/node \
 *     --import=tsx/esm \
 *     scripts/migrate-remaining.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface GeoData {
  lat: number; lng: number; country: string; state: string | null
}

const CITY_GEO: Record<string, GeoData> = {
  'Seattle':       { lat: 47.6062,  lng: -122.3321, country: 'United States', state: 'Washington' },
  'Palo Alto':     { lat: 37.4419,  lng: -122.1430, country: 'United States', state: 'California' },
  'San Francisco': { lat: 37.7749,  lng: -122.4194, country: 'United States', state: 'California' },
  'Phoenix':       { lat: 33.4484,  lng: -112.0740, country: 'United States', state: 'Arizona' },
  'New York':      { lat: 40.7128,  lng: -74.0060,  country: 'United States', state: 'New York' },
  'Los Angeles':   { lat: 34.0522,  lng: -118.2437, country: 'United States', state: 'California' },
  'Paris':         { lat: 48.8566,  lng: 2.3522,    country: 'France', state: null },
  // Stanford campus is in Palo Alto — same geo, display as "Palo Alto"
  'Stanford':      { lat: 37.4419,  lng: -122.1430, country: 'United States', state: 'California' },
}

interface Stop {
  city: string          // display name to store
  cityKey: string       // key into CITY_GEO (same unless Stanford → Palo Alto)
  start_date: string | null
  end_date: string | null
}

interface NewProfile {
  name: string
  note: string
  stops: Stop[]
}

// The 6 net-new profiles derived from the Excel.
// "Stanford" rows are stored as "Palo Alto" to match the existing city convention.
const NEW_PROFILES: NewProfile[] = [
  {
    name: 'Ross Gates',
    note: 'From combined Excel row "Alyssa Karbel and Ross gates"',
    stops: [
      { city: 'Phoenix',       cityKey: 'Phoenix',       start_date: '2026-06-15', end_date: '2026-08-09' },
      { city: 'San Francisco', cityKey: 'San Francisco', start_date: '2026-08-10', end_date: '2026-08-22' },
    ],
  },
  {
    name: 'Gracie Griffith',
    note: 'From combined Excel row "Grant & Gracie Griffith"',
    stops: [
      { city: 'Seattle', cityKey: 'Seattle', start_date: '2026-06-22', end_date: '2026-08-21' },
    ],
  },
  {
    name: 'Eric Wang',
    note: 'Direct Excel row; "Stanford" mapped to Palo Alto',
    stops: [
      { city: 'Palo Alto', cityKey: 'Stanford', start_date: '2026-06-01', end_date: '2026-09-15' },
    ],
  },
  {
    name: 'Kathy Hu',
    note: 'Direct Excel row; "Stanford" mapped to Palo Alto',
    stops: [
      { city: 'Palo Alto',     cityKey: 'Stanford',      start_date: '2026-06-01', end_date: '2026-07-24' },
      { city: 'New York',      cityKey: 'New York',      start_date: '2026-07-25', end_date: '2026-08-21' },
      { city: 'Los Angeles',   cityKey: 'Los Angeles',   start_date: '2026-08-22', end_date: '2026-09-18' },
    ],
  },
  {
    name: 'Swetha Srinivasan',
    note: 'Direct Excel row',
    stops: [
      { city: 'Seattle', cityKey: 'Seattle', start_date: '2026-06-20', end_date: '2026-09-11' },
    ],
  },
  {
    name: 'Jasper Burns',
    note: 'Direct Excel row',
    stops: [
      { city: 'New York', cityKey: 'New York', start_date: '2026-06-14', end_date: '2026-06-28' },
      { city: 'Paris',    cityKey: 'Paris',    start_date: '2026-06-28', end_date: '2026-08-14' },
    ],
  },
]

// Profiles that appear in Excel under shortened names but already exist in DB
// under their full names. Listed here for documentation; script does not touch them.
const ALREADY_IN_DB_UNDER_FULL_NAME = [
  { excel: 'Tafui Leggard',    db: 'Tafui Monique Leggard',   claimed: true },
  { excel: 'Ryan Chandra',     db: 'Ryan Dhruv Chandra',       claimed: true },
  { excel: 'Juanita Ferrer',   db: 'Juanita Ferrer Escobar',   claimed: true },
  { excel: 'Renato Ricaurte',  db: 'Renato Ricaurte Cogorno',  claimed: true },
]

async function main() {
  console.log('GSB27 Summer 2026 — targeted migration of remaining profiles')
  console.log('='.repeat(60))
  console.log(`\nProfiles to create: ${NEW_PROFILES.length}`)
  console.log('\nSkipping (already in DB under full name, all claimed):')
  ALREADY_IN_DB_UNDER_FULL_NAME.forEach(e => console.log(`  "${e.excel}" → "${e.db}"`))
  console.log()

  let created = 0, skipped = 0, errors = 0

  for (const profile of NEW_PROFILES) {
    console.log(`\n• ${profile.name}  [${profile.note}]`)

    // Safety check: does this name already exist? (idempotent guard)
    const { data: existing, error: checkErr } = await supabase
      .from('profiles')
      .select('id, user_id, full_name')
      .eq('full_name', profile.name)
      .maybeSingle()

    if (checkErr) {
      console.error(`  ✗ DB check error: ${checkErr.message}`)
      errors++
      continue
    }

    if (existing) {
      if (existing.user_id) {
        console.log(`  → Already exists & is CLAIMED — skipping`)
        skipped++
        continue
      }
      console.log(`  → Already exists (unclaimed, id=${existing.id}) — skipping profile creation, will add missing stops`)
      // Still fall through to location insertion below with existing id
      const profileId = existing.id
      await upsertLocations(profileId, profile)
      skipped++
      continue
    }

    // Create the profile
    const { data: created_profile, error: createErr } = await supabase
      .from('profiles')
      .insert({
        full_name: profile.name,
        email: null,
        has_completed_profile: false,
        is_admin: false,
      })
      .select('id')
      .single()

    if (createErr || !created_profile) {
      console.error(`  ✗ Failed to create profile: ${createErr?.message}`)
      errors++
      continue
    }

    console.log(`  → Created profile id=${created_profile.id}`)
    created++

    await upsertLocations(created_profile.id, profile)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅  Migration complete`)
  console.log(`   Created:  ${created} new profiles`)
  console.log(`   Skipped:  ${skipped} (already existed)`)
  console.log(`   Errors:   ${errors}`)
  console.log(`\nTotal DB profiles now: 137 existing + ${created} new = ${137 + created}`)
  console.log('\nNext: Admin → Profiles to assign emails for these accounts.')
}

async function upsertLocations(profileId: string, profile: NewProfile) {
  if (profile.stops.length === 0) {
    console.log(`  (no stops to add)`)
    return
  }

  const { data: existingLocs } = await supabase
    .from('locations')
    .select('city, sort_order')
    .eq('profile_id', profileId)

  const existingCities = new Set((existingLocs ?? []).map(l => l.city.toLowerCase()))
  const maxOrder = existingLocs?.length
    ? Math.max(...existingLocs.map(l => l.sort_order ?? 0))
    : -1
  let nextOrder = maxOrder + 1

  for (const stop of profile.stops) {
    if (existingCities.has(stop.city.toLowerCase())) {
      console.log(`  ✓ ${stop.city} already present`)
      continue
    }

    const geo = CITY_GEO[stop.cityKey]
    if (!geo) {
      console.warn(`  ✗ No geo data for "${stop.cityKey}" — skipping`)
      continue
    }

    // Validate dates: skip end_date if before start_date
    let { start_date, end_date } = stop
    if (start_date && end_date && end_date < start_date) {
      console.warn(`  ⚠ ${stop.city}: end (${end_date}) before start (${start_date}), clearing end date`)
      end_date = null
    }

    const { error: locErr } = await supabase.from('locations').insert({
      profile_id: profileId,
      city: stop.city,
      city_ascii: stop.city,
      state: geo.state,
      country: geo.country,
      lat: geo.lat,
      lng: geo.lng,
      start_date,
      end_date,
      sort_order: nextOrder++,
      so_name: null,
    })

    if (locErr) {
      console.error(`  ✗ Location insert failed (${stop.city}): ${locErr.message}`)
    } else {
      console.log(`  ✓ Added ${stop.city}  ${start_date ?? '?'} → ${end_date ?? '(open)'}`)
      existingCities.add(stop.city.toLowerCase())
    }
  }
}

main().catch(console.error)

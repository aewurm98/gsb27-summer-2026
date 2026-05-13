/**
 * Seed script: imports classmate data from the Excel file into Supabase.
 * Run with: npx ts-node --esm scripts/seed.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface GeoData {
  lat: number
  lng: number
  country: string
  state: string | null
}

// Known city coordinates — add new cities here as needed
const CITY_GEO: Record<string, GeoData> = {
  'Seattle':          { lat: 47.6062,  lng: -122.3321, country: 'United States', state: 'Washington' },
  'Salt Lake City':   { lat: 40.7608,  lng: -111.8910, country: 'United States', state: 'Utah' },
  'Phoenix':          { lat: 33.4484,  lng: -112.0740, country: 'United States', state: 'Arizona' },
  'San Francisco':    { lat: 37.7749,  lng: -122.4194, country: 'United States', state: 'California' },
  'Austin':           { lat: 30.2672,  lng: -97.7431,  country: 'United States', state: 'Texas' },
  'Los Angeles':      { lat: 34.0522,  lng: -118.2437, country: 'United States', state: 'California' },
  'New York':         { lat: 40.7128,  lng: -74.0060,  country: 'United States', state: 'New York' },
  'Chicago':          { lat: 41.8781,  lng: -87.6298,  country: 'United States', state: 'Illinois' },
  'Boston':           { lat: 42.3601,  lng: -71.0589,  country: 'United States', state: 'Massachusetts' },
  'Denver':           { lat: 39.7392,  lng: -104.9903, country: 'United States', state: 'Colorado' },
  'Miami':            { lat: 25.7617,  lng: -80.1918,  country: 'United States', state: 'Florida' },
  'Washington DC':    { lat: 38.9072,  lng: -77.0369,  country: 'United States', state: 'DC' },
  'Washington, DC':   { lat: 38.9072,  lng: -77.0369,  country: 'United States', state: 'DC' },
  'Portland':         { lat: 45.5231,  lng: -122.6765, country: 'United States', state: 'Oregon' },
  'Atlanta':          { lat: 33.7490,  lng: -84.3880,  country: 'United States', state: 'Georgia' },
  'Houston':          { lat: 29.7604,  lng: -95.3698,  country: 'United States', state: 'Texas' },
  'Minneapolis':      { lat: 44.9778,  lng: -93.2650,  country: 'United States', state: 'Minnesota' },
  'Nashville':        { lat: 36.1627,  lng: -86.7816,  country: 'United States', state: 'Tennessee' },
  'San Diego':        { lat: 32.7157,  lng: -117.1611, country: 'United States', state: 'California' },
  'Las Vegas':        { lat: 36.1699,  lng: -115.1398, country: 'United States', state: 'Nevada' },
  'London':           { lat: 51.5074,  lng: -0.1278,   country: 'United Kingdom', state: null },
  'Tokyo':            { lat: 35.6762,  lng: 139.6503,  country: 'Japan', state: null },
  'Paris':            { lat: 48.8566,  lng: 2.3522,    country: 'France', state: null },
  'Barcelona':        { lat: 41.3851,  lng: 2.1734,    country: 'Spain', state: null },
  'Singapore':        { lat: 1.3521,   lng: 103.8198,  country: 'Singapore', state: null },
  'Sydney':           { lat: -33.8688, lng: 151.2093,  country: 'Australia', state: null },
  'Toronto':          { lat: 43.6532,  lng: -79.3832,  country: 'Canada', state: null },
}

interface ClassmateRow {
  name: string
  stops: Array<{ city: string; start_date: string | null; end_date: string | null }>
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'string') return val.slice(0, 10)
  if (typeof val === 'number') {
    const d = xlsx.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

function lookupGeo(city: string): GeoData | null {
  if (CITY_GEO[city]) return CITY_GEO[city]
  const base = city.split(',')[0].trim()
  return CITY_GEO[base] ?? null
}

async function main() {
  const filePath = path.join(__dirname, '..', '..', 'GSB MBA27 Summer 2026 Directory .xlsx')
  const wb = xlsx.readFile(filePath)
  const ws = wb.Sheets['Classmate Details']
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // Data starts at row index 5 (row 6 in Excel)
  const classmates: ClassmateRow[] = []

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const name = row[1]
    if (!name || typeof name !== 'string' || name.trim() === '') continue

    const stops: ClassmateRow['stops'] = []
    for (let s = 0; s < 3; s++) {
      const baseCol = 2 + s * 3
      const city = row[baseCol]
      if (!city || typeof city !== 'string' || city.trim() === '') continue
      stops.push({
        city: city.trim(),
        start_date: parseDate(row[baseCol + 1]),
        end_date: parseDate(row[baseCol + 2]),
      })
    }

    classmates.push({ name: name.trim(), stops })
  }

  console.log(`Total classmates: ${classmates.length}`)
  classmates.forEach((cm, i) => {
    const summary = cm.stops.map(s => `${s.city} (${s.start_date ?? 'nan'} → ${s.end_date ?? 'nan'})`).join(' | ')
    console.log(`  ${i + 1}. ${cm.name}: ${summary || '(no stops)'}`)
  })
  console.log()

  for (const cm of classmates) {
    console.log(`Processing: ${cm.name}`)

    const { data: existing } = await supabase
      .from('profiles')
      .select('id, user_id')
      .eq('full_name', cm.name)
      .maybeSingle()

    let profileId: string

    if (existing) {
      profileId = existing.id
      await supabase
        .from('profiles')
        .update({ has_completed_profile: true })
        .eq('id', profileId)
      console.log(`  → Updated existing profile ${profileId}${existing.user_id ? ' (claimed)' : ' (unclaimed)'}`)
    } else {
      const { data: created, error } = await supabase
        .from('profiles')
        .insert({ full_name: cm.name, has_completed_profile: true, is_admin: false })
        .select('id')
        .single()

      if (error || !created) {
        console.error(`  ✗ Failed to create profile: ${error?.message}`)
        continue
      }
      profileId = created.id
      console.log(`  → Created profile ${profileId}`)
    }

    // Preserve any manually-set so_name values before wiping locations
    const { data: existingLocs } = await supabase
      .from('locations')
      .select('sort_order, so_name')
      .eq('profile_id', profileId)
    const soNameBySortOrder: Record<number, string | null> = {}
    for (const el of existingLocs ?? []) {
      soNameBySortOrder[el.sort_order] = el.so_name ?? null
    }

    await supabase.from('locations').delete().eq('profile_id', profileId)

    for (let i = 0; i < cm.stops.length; i++) {
      const stop = cm.stops[i]
      const geo = lookupGeo(stop.city)

      if (!geo) {
        console.warn(`  ✗ No geo data for "${stop.city}" — add to CITY_GEO in scripts/seed.ts`)
        continue
      }

      const { error } = await supabase.from('locations').insert({
        profile_id: profileId,
        city: stop.city,
        city_ascii: stop.city,
        state: geo.state,
        country: geo.country,
        lat: geo.lat,
        lng: geo.lng,
        start_date: stop.start_date,
        end_date: stop.end_date,
        sort_order: i,
        so_name: soNameBySortOrder[i] ?? null,
      })

      if (error) {
        console.error(`  ✗ Location error: ${error.message}`)
      } else {
        console.log(`  ✓ ${stop.city} ${stop.start_date ?? '?'} – ${stop.end_date ?? '?'}`)
      }
    }
  }

  console.log('\n✅ Seed complete!')
  console.log('\nNext: go to Admin → Profiles tab to add email addresses for each classmate.')
  console.log('When they sign in with that email, their profile will be auto-claimed.')
}

main().catch(console.error)

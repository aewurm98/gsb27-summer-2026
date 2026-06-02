/**
 * Non-destructive seed script — imports classmate data from the Excel file into Supabase.
 *
 * Rules:
 *   • Claimed profiles (user_id is set) → location data is NEVER touched
 *   • Unclaimed profiles that already exist → only ADDS cities not already present
 *   • Profiles not yet in the DB → created fresh with all stops
 *
 * Run: node --env-file=.env.local --import=tsx/esm scripts/seed.ts [path/to/file.xlsx]
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface GeoData {
  lat: number
  lng: number
  country: string
  state: string | null
}

const CITY_GEO: Record<string, GeoData> = {
  'Seattle':          { lat: 47.6062,  lng: -122.3321, country: 'United States', state: 'Washington' },
  'Salt Lake City':   { lat: 40.7608,  lng: -111.8910, country: 'United States', state: 'Utah' },
  'Phoenix':          { lat: 33.4484,  lng: -112.0740, country: 'United States', state: 'Arizona' },
  'San Francisco':    { lat: 37.7749,  lng: -122.4194, country: 'United States', state: 'California' },
  'Palo Alto':        { lat: 37.4419,  lng: -122.1430, country: 'United States', state: 'California' },
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
  'Seoul':            { lat: 37.5665,  lng: 126.9780,  country: 'South Korea', state: null },
  'Shanghai':         { lat: 31.2304,  lng: 121.4737,  country: 'China', state: null },
  'Paris':            { lat: 48.8566,  lng: 2.3522,    country: 'France', state: null },
  'Rome':             { lat: 41.9028,  lng: 12.4964,   country: 'Italy', state: null },
  'Italy':            { lat: 41.9028,  lng: 12.4964,   country: 'Italy', state: null },
  'Madrid':           { lat: 40.4168,  lng: -3.7038,   country: 'Spain', state: null },
  'Spain':            { lat: 40.4168,  lng: -3.7038,   country: 'Spain', state: null },
  'Barcelona':        { lat: 41.3851,  lng: 2.1734,    country: 'Spain', state: null },
  'Singapore':        { lat: 1.3521,   lng: 103.8198,  country: 'Singapore', state: null },
  'Sydney':           { lat: -33.8688, lng: 151.2093,  country: 'Australia', state: null },
  'Toronto':          { lat: 43.6532,  lng: -79.3832,  country: 'Canada', state: null },
  'Europe':           { lat: 48.8566,  lng: 2.3522,    country: 'France', state: null },
}

// Normalize non-standard city strings from the spreadsheet
const CITY_ALIASES: Record<string, string> = {
  'Palo Alto/ San Francisco': 'Palo Alto',
  'Palo Alto/San Francisco':  'Palo Alto',
  'SF':                       'San Francisco',
  'NYC':                      'New York',
  'NYC ':                     'New York',
  'LA':                       'Los Angeles',
  'DC':                       'Washington DC',
}

interface ClassmateRow {
  name: string
  stops: Array<{ city: string; start_date: string | null; end_date: string | null }>
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'string') {
    const s = val.trim()
    // Handle "7.1.26", "9.1.26" style dates
    const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
    if (dotMatch) {
      const [, m, d, y] = dotMatch
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return s.slice(0, 10)
  }
  if (typeof val === 'number') {
    const d = xlsx.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

function normalizeCity(raw: string): string {
  const trimmed = raw.trim()
  return CITY_ALIASES[trimmed] ?? trimmed
}

function lookupGeo(city: string): GeoData | null {
  if (CITY_GEO[city]) return CITY_GEO[city]
  const base = city.split(',')[0].trim()
  return CITY_GEO[base] ?? null
}

function findExcelFile(): string {
  // CLI arg takes priority
  const arg = process.argv[2]
  if (arg) {
    if (!fs.existsSync(arg)) {
      console.error(`File not found: ${arg}`)
      process.exit(1)
    }
    return arg
  }

  const candidates = [
    path.join(__dirname, '..', '..', 'GSB MBA27 Summer 2026 Directory .xlsx'),
    path.join(process.env.HOME ?? '~', 'Downloads', 'GSB MBA27 Summer 2026 Directory .xlsx'),
    path.join(__dirname, '..', 'GSB MBA27 Summer 2026 Directory .xlsx'),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  console.error('Could not find the Excel file. Pass the path as an argument:')
  console.error('  node --env-file=.env.local --import=tsx/esm scripts/seed.ts /path/to/file.xlsx')
  process.exit(1)
}

async function main() {
  const filePath = findExcelFile()
  console.log(`Reading: ${filePath}\n`)

  const wb = xlsx.readFile(filePath)
  const ws = wb.Sheets['Classmate Details']
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

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
        city: normalizeCity(city),
        start_date: parseDate(row[baseCol + 1]),
        end_date: parseDate(row[baseCol + 2]),
      })
    }

    classmates.push({ name: name.trim(), stops })
  }

  console.log(`Found ${classmates.length} classmates in spreadsheet\n`)

  let created = 0, skippedClaimed = 0, merged = 0, errors = 0

  for (const cm of classmates) {
    console.log(`• ${cm.name}`)

    // Match by exact name (most reliable without email data)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, user_id')
      .eq('full_name', cm.name)
      .maybeSingle()

    let profileId: string

    if (existing) {
      if (existing.user_id) {
        // User has claimed this profile — their location data is theirs, never touch it
        console.log(`  → Claimed by user, skipping all updates\n`)
        skippedClaimed++
        continue
      }

      profileId = existing.id
      console.log(`  → Found unclaimed profile ${profileId}`)
      merged++
    } else {
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({ full_name: cm.name, has_completed_profile: false, is_admin: false })
        .select('id')
        .single()

      if (error || !newProfile) {
        console.error(`  ✗ Failed to create profile: ${error?.message}\n`)
        errors++
        continue
      }

      profileId = newProfile.id
      console.log(`  → Created profile ${profileId}`)
      created++
    }

    if (cm.stops.length === 0) {
      console.log(`  (no locations in spreadsheet)\n`)
      continue
    }

    // Fetch existing locations to avoid duplicates
    const { data: existingLocs } = await supabase
      .from('locations')
      .select('city, sort_order')
      .eq('profile_id', profileId)

    const existingCities = new Set((existingLocs ?? []).map(l => l.city.toLowerCase()))
    const maxOrder = Math.max(-1, ...(existingLocs ?? []).map(l => l.sort_order ?? 0))
    let nextOrder = existingLocs?.length ? maxOrder + 1 : 0

    for (const stop of cm.stops) {
      if (existingCities.has(stop.city.toLowerCase())) {
        console.log(`  ✓ ${stop.city} already present`)
        continue
      }

      const geo = lookupGeo(stop.city)
      if (!geo) {
        console.warn(`  ✗ No geo for "${stop.city}" — add to CITY_GEO in seed.ts`)
        continue
      }

      // Validate dates: if end < start, clear the end date
      let { start_date, end_date } = stop
      if (start_date && end_date && end_date < start_date) {
        console.warn(`  ⚠ ${stop.city}: end date (${end_date}) before start (${start_date}), clearing end date`)
        end_date = null
      }

      const { error } = await supabase.from('locations').insert({
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

      if (error) {
        console.error(`  ✗ Location error (${stop.city}): ${error.message}`)
      } else {
        console.log(`  ✓ Added ${stop.city}  ${start_date ?? '?'} → ${end_date ?? '(open)'}`)
        existingCities.add(stop.city.toLowerCase())
      }
    }

    console.log()
  }

  console.log('─'.repeat(50))
  console.log(`✅ Seed complete`)
  console.log(`   Created:         ${created}`)
  console.log(`   Merged (uncl.):  ${merged}`)
  console.log(`   Skipped (clmd):  ${skippedClaimed}`)
  console.log(`   Errors:          ${errors}`)
  console.log()
  console.log('Next: Admin → Profiles tab to set email addresses so classmates can claim their profiles.')
}

main().catch(console.error)

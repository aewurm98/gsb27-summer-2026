/**
 * Seed script: imports classmate data from the Excel file into Supabase.
 * Run with: npx ts-node --esm scripts/seed.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Also requires NEXT_PUBLIC_MAPBOX_TOKEN for geocoding.
 */

import * as xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface ClassmateRow {
  name: string
  stops: Array<{ city: string; start_date: string | null; end_date: string | null }>
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number; country: string; state: string | null } | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?types=place,locality&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  const data = await res.json() as { features: Array<{ center: [number, number]; context: Array<{ id: string; text: string }> }> }
  const feature = data.features?.[0]
  if (!feature) return null

  const context = feature.context ?? []
  const country = context.find(c => c.id.startsWith('country'))?.text ?? 'United States'
  const region = context.find(c => c.id.startsWith('region'))?.text ?? null

  return { lat: feature.center[1], lng: feature.center[0], country, state: region }
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'string') return val.slice(0, 10)
  if (typeof val === 'number') {
    // Excel serial date
    const d = xlsx.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  return null
}

async function main() {
  const filePath = path.join(__dirname, '..', '..', 'GSB MBA27 Summer 2026 Directory .xlsx')
  const wb = xlsx.readFile(filePath)
  const ws = wb.Sheets['Classmate Details']
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // Row 4 (index 4) is headers: Name | City | Start | End | City | Start | End | City | Start | End
  // Data starts at row 5 (index 5)
  const classmates: ClassmateRow[] = []

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const name = row[1]
    if (!name || typeof name !== 'string' || name.trim() === '') continue

    const stops: ClassmateRow['stops'] = []
    // Stop 1: cols 2,3,4; Stop 2: cols 5,6,7; Stop 3: cols 8,9,10
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

  console.log(`Found ${classmates.length} classmates`)

  for (const cm of classmates) {
    console.log(`\nProcessing: ${cm.name}`)

    // Create a fake user email (they'll claim their profile by signing in)
    const fakeEmail = `${cm.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@stanford.edu`

    // Upsert profile (by full_name since no user_id yet — admin pre-seeded)
    // We use a special admin seed approach: create auth user first, then profile
    // For simplicity, we insert profiles without user_id (NULL) for pre-seeded data
    // When classmates sign in, they claim their profile via email match

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', cm.name)
      .single()

    let profileId: string

    if (existingProfile) {
      profileId = existingProfile.id
      console.log(`  → Existing profile ${profileId}`)
    } else {
      // We need to insert without user_id — modify schema to allow NULL user_id for seeded profiles
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({ full_name: cm.name, is_admin: false })
        .select('id')
        .single()

      if (error || !newProfile) {
        console.error(`  ✗ Failed to create profile: ${error?.message}`)
        continue
      }
      profileId = newProfile.id
      console.log(`  → Created profile ${profileId}`)
    }

    // Delete old locations
    await supabase.from('locations').delete().eq('profile_id', profileId)

    // Geocode and insert locations
    for (let i = 0; i < cm.stops.length; i++) {
      const stop = cm.stops[i]
      console.log(`  → Geocoding: ${stop.city}`)

      const geo = await geocodeCity(stop.city)
      if (!geo) {
        console.warn(`    ✗ Could not geocode "${stop.city}"`)
        continue
      }

      await supabase.from('locations').insert({
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
      })

      console.log(`    ✓ ${stop.city} (${geo.lat}, ${geo.lng}) ${stop.start_date} – ${stop.end_date}`)

      // Rate limit
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log('\n✅ Seed complete!')
}

main().catch(console.error)

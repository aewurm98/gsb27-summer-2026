import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  'Portland':         { lat: 45.5231,  lng: -122.6765, country: 'United States', state: 'Oregon' },
  'Atlanta':          { lat: 33.7490,  lng: -84.3880,  country: 'United States', state: 'Georgia' },
  'Houston':          { lat: 29.7604,  lng: -95.3698,  country: 'United States', state: 'Texas' },
  'Nashville':        { lat: 36.1627,  lng: -86.7816,  country: 'United States', state: 'Tennessee' },
  'San Diego':        { lat: 32.7157,  lng: -117.1611, country: 'United States', state: 'California' },
  'Las Vegas':        { lat: 36.1699,  lng: -115.1398, country: 'United States', state: 'Nevada' },
  'Minneapolis':      { lat: 44.9778,  lng: -93.2650,  country: 'United States', state: 'Minnesota' },
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

async function geocodeCity(city: string): Promise<GeoData | null> {
  const trimmed = city.trim()
  if (CITY_GEO[trimmed]) return CITY_GEO[trimmed]
  const base = trimmed.split(',')[0].trim()
  if (CITY_GEO[base]) return CITY_GEO[base]

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?types=place,locality&limit=1&access_token=${token}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null

    const context = (feature.context ?? []) as Array<{ id: string; text: string }>
    const country = context.find(c => c.id.startsWith('country'))?.text ?? ''
    const region = context.find(c => c.id.startsWith('region'))?.text ?? null

    return {
      lat: feature.center[1],
      lng: feature.center[0],
      country,
      state: country === 'United States' ? region : null,
    }
  } catch {
    return null
  }
}

export interface ImportStop {
  city: string
  start_date?: string | null
  end_date?: string | null
  label?: string | null
}

export interface ImportProfile {
  name: string
  email?: string | null
  stops: ImportStop[]
}

export interface ImportResult {
  name: string
  action: 'created' | 'merged' | 'skipped_claimed' | 'error'
  profileId?: string
  locationsAdded: string[]
  locationsSkipped: string[]
  error?: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!myProfile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as { profiles: ImportProfile[] }
  const { profiles } = body

  if (!Array.isArray(profiles) || profiles.length === 0) {
    return NextResponse.json({ error: 'profiles array required' }, { status: 400 })
  }

  const results: ImportResult[] = []

  for (const cm of profiles) {
    const name = cm.name?.trim()
    if (!name) continue

    const result: ImportResult = { name, action: 'created', locationsAdded: [], locationsSkipped: [] }

    try {
      // Find existing profile: email first, then exact name
      let existing: { id: string; user_id: string | null } | null = null

      if (cm.email?.trim()) {
        const { data } = await supabase
          .from('profiles')
          .select('id, user_id')
          .eq('email', cm.email.trim())
          .maybeSingle()
        existing = data
      }

      if (!existing) {
        const { data } = await supabase
          .from('profiles')
          .select('id, user_id')
          .eq('full_name', name)
          .maybeSingle()
        existing = data
      }

      let profileId: string

      if (existing) {
        if (existing.user_id) {
          result.action = 'skipped_claimed'
          results.push(result)
          continue
        }
        profileId = existing.id
        result.action = 'merged'
        result.profileId = profileId
      } else {
        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .insert({
            full_name: name,
            email: cm.email?.trim() || null,
            has_completed_profile: false,
            is_admin: false,
          })
          .select('id')
          .single()

        if (createErr || !created) {
          result.action = 'error'
          result.error = createErr?.message ?? 'Failed to create profile'
          results.push(result)
          continue
        }

        profileId = created.id
        result.action = 'created'
        result.profileId = profileId
      }

      // Fetch existing locations to avoid duplicates
      const { data: existingLocs } = await supabase
        .from('locations')
        .select('city, sort_order')
        .eq('profile_id', profileId)

      const existingCities = new Set((existingLocs ?? []).map(l => l.city.toLowerCase()))
      const maxOrder = Math.max(-1, ...(existingLocs ?? []).map(l => l.sort_order ?? 0))
      let nextOrder = existingLocs?.length ? maxOrder + 1 : 0

      for (const stop of cm.stops ?? []) {
        const cityName = stop.city?.trim()
        if (!cityName) continue

        if (existingCities.has(cityName.toLowerCase())) {
          result.locationsSkipped.push(cityName)
          continue
        }

        const geo = await geocodeCity(cityName)
        if (!geo) {
          result.locationsSkipped.push(`${cityName} (no geo)`)
          continue
        }

        // Validate dates
        let startDate = stop.start_date || null
        let endDate = stop.end_date || null
        if (startDate && endDate && endDate < startDate) endDate = null

        const { error: locErr } = await supabase.from('locations').insert({
          profile_id: profileId,
          city: cityName,
          city_ascii: cityName,
          state: geo.state,
          country: geo.country,
          lat: geo.lat,
          lng: geo.lng,
          start_date: startDate,
          end_date: endDate,
          sort_order: nextOrder++,
          label: stop.label || null,
          so_name: null,
        })

        if (locErr) {
          result.locationsSkipped.push(`${cityName} (db error)`)
        } else {
          result.locationsAdded.push(cityName)
          existingCities.add(cityName.toLowerCase())
        }
      }
    } catch (e) {
      result.action = 'error'
      result.error = String(e)
    }

    results.push(result)
  }

  return NextResponse.json({ results })
}

export interface Profile {
  id: string
  user_id: string
  full_name: string
  linkedin_url: string | null
  photo_url: string | null
  bio: string | null
  section: string | null
  pre_mba_company: string | null
  pre_mba_role: string | null
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
  profile?: Profile
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
export const SUMMER_END = new Date('2026-09-14')
export const SUMMER_WEEKS = 16

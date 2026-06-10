import { createClient } from '@/lib/supabase/server'
import { TreksClient } from '@/components/treks/TreksClient'

export interface SuggestedDestination {
  city: string
  country: string
  lat: number | null
  lng: number | null
  interestedProfiles: Array<{ id: string; full_name: string; photo_url: string | null }>
}

export default async function TreksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: treks } = await supabase
    .from('treks')
    .select('*, trek_interests(*, profile:profiles(id, full_name, photo_url))')
    .order('created_at', { ascending: false })

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id, is_admin')
    .eq('user_id', user!.id)
    .single()

  // For member-picker + invite emails: fetch all classmates with email
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, photo_url, email')
    .order('full_name')

  // Compute suggested treks from travel interests (3+ classmates share a destination)
  const { data: allInterests } = await supabase
    .from('travel_interests')
    .select('destination_city, destination_country, destination_lat, destination_lng, profile:profiles(id, full_name, photo_url)')

  const existingTrekCities = new Set((treks ?? []).map(t => t.destination_city.toLowerCase()))

  const cityMap = new Map<string, SuggestedDestination>()
  for (const interest of allInterests ?? []) {
    const key = interest.destination_city.toLowerCase()
    if (existingTrekCities.has(key)) continue
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: interest.destination_city,
        country: interest.destination_country,
        lat: interest.destination_lat,
        lng: interest.destination_lng,
        interestedProfiles: [],
      })
    }
    // Supabase returns nested joins as arrays even for many-to-one; normalise
    const profileRaw = interest.profile
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
      { id: string; full_name: string; photo_url: string | null } | null
    if (profile) {
      const dest = cityMap.get(key)!
      if (!dest.interestedProfiles.find(p => p.id === profile.id)) {
        dest.interestedProfiles.push(profile)
      }
    }
  }

  const suggestedDestinations: SuggestedDestination[] = Array.from(cityMap.values())
    .filter(d => d.interestedProfiles.length >= 2)
    .sort((a, b) => b.interestedProfiles.length - a.interestedProfiles.length)

  // Build city → profileId[] map for invite pre-selection (all interests, not just suggestable)
  const interestsByCity: Record<string, string[]> = {}
  for (const interest of allInterests ?? []) {
    const key = interest.destination_city.toLowerCase()
    if (!interestsByCity[key]) interestsByCity[key] = []
    const profileRaw = interest.profile
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { id: string } | null
    if (profile && !interestsByCity[key].includes(profile.id)) {
      interestsByCity[key].push(profile.id)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Group Treks</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Classmate-organized adventures. Signal interest in destinations and step up to lead a trek.
        </p>
      </div>
      <TreksClient
        treks={treks ?? []}
        myProfileId={myProfile?.id ?? null}
        isAdmin={myProfile?.is_admin ?? false}
        suggestedDestinations={suggestedDestinations}
        allProfiles={allProfiles ?? []}
        interestsByCity={interestsByCity}
      />
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'
import type { Profile, Location, TravelInterest } from '@/lib/types'

export type MapProfile = Pick<Profile, 'id' | 'full_name' | 'photo_url' | 'can_host' | 'open_to_visit'> & {
  locations: Location[]
  travel_interests: Pick<TravelInterest, 'destination_city' | 'destination_country' | 'destination_lat' | 'destination_lng' | 'open_to_others' | 'is_planned'>[]
}

const MapClient = dynamic(
  () => import('@/components/map/MapClient').then((m) => m.MapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading map…
      </div>
    ),
  }
)

export function MapWrapper({ profiles }: { profiles: MapProfile[] }) {
  return <MapClient profiles={profiles} />
}

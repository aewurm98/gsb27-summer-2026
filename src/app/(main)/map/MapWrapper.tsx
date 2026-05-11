'use client'

import dynamic from 'next/dynamic'
import type { Profile, Location } from '@/lib/types'

type MapProfile = Pick<Profile, 'id' | 'full_name' | 'photo_url'> & {
  locations: Location[]
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

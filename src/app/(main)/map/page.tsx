import { createClient } from '@/lib/supabase/server'
import { MapWrapper } from './MapWrapper'

export default async function MapPage() {
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, photo_url, can_host, open_to_visit, locations(*), travel_interests(destination_city, destination_country, destination_lat, destination_lng, open_to_others, is_planned)')
    .order('full_name')

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <MapWrapper profiles={profiles ?? []} />
    </div>
  )
}

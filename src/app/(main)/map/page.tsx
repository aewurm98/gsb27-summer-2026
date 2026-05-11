import { createClient } from '@/lib/supabase/server'
import { MapWrapper } from './MapWrapper'

export default async function MapPage() {
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, photo_url, pre_mba_company, pre_mba_role, locations(*)')
    .order('full_name')

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <MapWrapper profiles={profiles ?? []} />
    </div>
  )
}

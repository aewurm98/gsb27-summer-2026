import { createClient } from '@/lib/supabase/server'
import { DirectoryClient } from '@/components/directory/DirectoryClient'

export default async function DirectoryPage() {
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*, locations(*), travel_interests(*)')
    .order('full_name')

  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = user
    ? await supabase
        .from('profiles')
        .select('*, locations(*), travel_interests(*)')
        .eq('user_id', user.id)
        .single()
    : { data: null }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Classmate Directory</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {profiles?.length ?? 0} classmates · filter by city or week to find overlap
        </p>
      </div>
      <DirectoryClient
        profiles={profiles ?? []}
        myProfileId={myProfile?.id ?? null}
        myProfile={myProfile ?? null}
      />
    </div>
  )
}

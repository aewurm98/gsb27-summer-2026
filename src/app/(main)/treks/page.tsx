import { createClient } from '@/lib/supabase/server'
import { TreksClient } from '@/components/treks/TreksClient'

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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Group Treks</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Admin-organized adventures. Signal your interest and we'll coordinate.
        </p>
      </div>
      <TreksClient
        treks={treks ?? []}
        myProfileId={myProfile?.id ?? null}
        isAdmin={myProfile?.is_admin ?? false}
      />
    </div>
  )
}

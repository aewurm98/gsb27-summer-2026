import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileEditForm } from '@/components/profile/ProfileEditForm'

export default async function ProfileEditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, locations(*), travel_interests(*)')
    .eq('user_id', user.id)
    .single()

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, locations(*)')
    .neq('user_id', user.id)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Update your summer itinerary and travel interests.
        </p>
      </div>
      <ProfileEditForm
        profile={profile}
        allProfiles={allProfiles ?? []}
        userId={user.id}
      />
    </div>
  )
}

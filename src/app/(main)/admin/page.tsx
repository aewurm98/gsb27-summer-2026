import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminClient } from '@/components/admin/AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!myProfile?.is_admin) redirect('/')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*, locations(*), travel_interests(*)')
    .order('full_name')

  const { data: treks } = await supabase
    .from('treks')
    .select('*, trek_interests(*, profile:profiles(id, full_name))')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {profiles?.length ?? 0} classmates · manage data, export, and treks
          </p>
        </div>
      </div>
      <AdminClient profiles={profiles ?? []} treks={treks ?? []} />
    </div>
  )
}

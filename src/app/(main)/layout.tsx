import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  console.log('[layout:uid]', user.id)
  console.log('[layout:profile]', profile?.full_name ?? 'NULL')
  console.log('[layout:error]', profileError?.code ?? 'none', profileError?.message ?? '')

  if (profile && !profile.has_completed_profile) {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') ?? ''
    if (!pathname.startsWith('/profile/edit')) {
      redirect('/profile/edit')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar profile={profile} />
      <main className="flex-1">{children}</main>
    </div>
  )
}

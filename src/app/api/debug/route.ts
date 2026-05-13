import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not authenticated', userError: userError?.message })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, is_admin, has_completed_profile, user_id, email')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    auth: {
      id: user.id,
      email: user.email,
    },
    profile: profile ?? null,
    profileError: profileError ? { code: profileError.code, message: profileError.message } : null,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })
}

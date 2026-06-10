import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Use only in server-side code for
// public-facing routes that need to read data without an authenticated session.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

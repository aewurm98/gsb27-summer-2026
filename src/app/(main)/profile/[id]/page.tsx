import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDateRange, avatarColor, getInitials } from '@/lib/utils'
import Image from 'next/image'
import { MapPin, Globe, Home, Plane } from 'lucide-react'
import Link from 'next/link'

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, locations(*), travel_interests(*)')
    .eq('id', id)
    .single()

  if (!profile) notFound()

  const locations = (profile.locations ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
  const interests = profile.travel_interests ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6 flex items-start gap-4">
        <div className={`relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white font-semibold text-lg shrink-0 ${avatarColor(profile.full_name)}`}>
          {profile.photo_url
            ? <Image src={profile.photo_url} alt={profile.full_name} fill className="object-cover" unoptimized />
            : getInitials(profile.full_name)
          }
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{profile.full_name}</h1>
          {profile.section && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {profile.section}
            </span>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {profile.can_host && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Home size={10} /> Available to host
              </span>
            )}
            {profile.open_to_visit && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Plane size={10} /> Open to visit
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hosting details */}
      {profile.can_host && profile.hosting_details && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-2">Hosting</h2>
          <p className="text-sm leading-relaxed">{profile.hosting_details}</p>
        </div>
      )}

      {/* Additional details */}
      {profile.additional_details && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">About</h2>
          <p className="text-sm leading-relaxed">{profile.additional_details}</p>
        </div>
      )}

      {/* Summer plans */}
      {locations.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Summer plans</h2>
          <div className="space-y-0">
            {locations.map((loc: {
              id: string; city: string; state: string | null; country: string
              start_date: string | null; end_date: string | null; sort_order: number
              label: string | null; company: string | null; role: string | null; so_name: string | null
            }, i: number) => (
              <div key={loc.id} className="flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin size={12} className="text-primary" />
                  </div>
                  {i < locations.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-1" />
                  )}
                </div>
                <div className="pt-0.5 pb-4">
                  {loc.label && (
                    <p className="text-xs font-semibold text-primary mb-0.5">{loc.label}</p>
                  )}
                  {(loc.role || loc.company) && (
                    <p className="text-xs text-muted-foreground mb-0.5">
                      {[loc.role, loc.company].filter(Boolean).join(' @ ')}
                    </p>
                  )}
                  <p className="font-medium text-sm">
                    {loc.city}{loc.state ? `, ${loc.state}` : ''}{loc.country !== 'United States' ? `, ${loc.country}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateRange(loc.start_date, loc.end_date)}
                  </p>
                  {loc.so_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      w/ {loc.so_name} <span className="opacity-60">(SO)</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Travel interests */}
      {interests.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Travel interests</h2>
          <div className="flex flex-wrap gap-2">
            {interests.map((interest: {
              id: string; destination_city: string; destination_country: string
              notes: string | null; interest_start_date: string | null; interest_end_date: string | null
            }) => (
              <div key={interest.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-sm">
                <Globe size={11} className="text-muted-foreground" />
                <span>
                  {interest.destination_city}
                  {interest.destination_country !== 'United States' ? `, ${interest.destination_country}` : ''}
                </span>
                {(interest.interest_start_date || interest.interest_end_date) && (
                  <span className="text-xs text-muted-foreground">
                    · {formatDateRange(interest.interest_start_date, interest.interest_end_date)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href="/directory" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition">
        ← Back to directory
      </Link>
    </div>
  )
}

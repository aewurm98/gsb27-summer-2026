'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { CityAutocomplete } from './CityAutocomplete'
import { Profile, Location, TravelInterest } from '@/lib/types'
import { getOverlappingClassmates, avatarColor, getInitials } from '@/lib/utils'
import { Plus, Trash2, Save, Users, Loader2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'

const EXPERIENCE_LABELS = ['Summer Internship', 'Traveling', 'Visiting family/friends', 'Other'] as const

const ACTIVITY_TAGS = [
  'hiking', 'surfing', 'skiing', 'cycling', 'running', 'yoga',
  'food & wine', 'nightlife', 'art & culture', 'history', 'beaches',
  'mountains', 'cities', 'road trips', 'backpacking', 'luxury',
] as const

const TRIP_STYLES = ['adventure', 'cultural', 'relaxation', 'foodie', 'nightlife', 'mixed'] as const
const GROUP_SIZE_PREFS = ['solo', 'small (2-4)', 'medium (5-10)', 'large (10+)', 'any'] as const
const INTENT_OPTIONS = ['working remotely', 'tourism', 'visiting family', 'conference', 'open'] as const

interface LocationDraft {
  id?: string
  city: string
  city_ascii: string | null
  state: string | null
  country: string
  lat: number | null
  lng: number | null
  start_date: string
  end_date: string
  sort_order: number
  label: string
  company: string
  role: string
  so_name: string
}

interface InterestDraft {
  id?: string
  destination_city: string
  destination_country: string
  destination_lat: number | null
  destination_lng: number | null
  notes: string
  interest_start_date: string
  interest_end_date: string
  intent: string
}

type AllProfile = Pick<Profile, 'id' | 'full_name'> & { locations: Location[] }

function newLocationDraft(order: number): LocationDraft {
  return {
    city: '', city_ascii: null, state: null, country: 'United States',
    lat: null, lng: null, start_date: '', end_date: '', sort_order: order,
    label: 'Summer Internship', company: '', role: '', so_name: '',
  }
}

export function ProfileEditForm({
  profile,
  allProfiles,
  userId,
}: {
  profile: (Profile & { locations: Location[]; travel_interests: TravelInterest[] }) | null
  allProfiles: AllProfile[]
  userId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const isNewUser = !profile?.has_completed_profile

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [section, setSection] = useState(profile?.section ?? '')
  const [additionalDetails, setAdditionalDetails] = useState(profile?.additional_details ?? '')
  const [canHost, setCanHost] = useState(profile?.can_host ?? false)
  const [hostingDetails, setHostingDetails] = useState(profile?.hosting_details ?? '')
  const [openToVisit, setOpenToVisit] = useState(profile?.open_to_visit ?? false)
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url ?? '')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [locations, setLocations] = useState<LocationDraft[]>(
    profile?.locations?.length
      ? profile.locations
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(l => ({
            ...l,
            start_date: l.start_date ?? '',
            end_date: l.end_date ?? '',
            label: l.label ?? 'Summer Internship',
            company: l.company ?? '',
            role: l.role ?? '',
            so_name: l.so_name ?? '',
          }))
      : [newLocationDraft(0)]
  )

  const [interests, setInterests] = useState<InterestDraft[]>(
    profile?.travel_interests?.map(t => ({
      id: t.id,
      destination_city: t.destination_city,
      destination_country: t.destination_country,
      destination_lat: t.destination_lat,
      destination_lng: t.destination_lng,
      notes: t.notes ?? '',
      interest_start_date: t.interest_start_date ?? '',
      interest_end_date: t.interest_end_date ?? '',
      intent: t.intent ?? '',
    })) ?? []
  )

  // Travel preference state
  const [activityTags, setActivityTags] = useState<Set<string>>(
    new Set(profile?.activity_tags ?? [])
  )
  const [tripStyle, setTripStyle] = useState<string>(profile?.trip_style ?? '')
  const [groupSizePref, setGroupSizePref] = useState<string>(profile?.group_size_pref ?? '')

  function toggleActivityTag(tag: string) {
    setActivityTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overlaps = profile
    ? getOverlappingClassmates(
        locations.filter(l => l.lat !== null) as Location[],
        allProfiles.map(p => ({ id: p.id, full_name: p.full_name, locations: p.locations }))
      )
    : []

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setPhotoUrl(data.publicUrl)
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setUploadingPhoto(false)
    }
  }

  function updateLocation(index: number, patch: Partial<LocationDraft>) {
    setLocations(prev => prev.map((l, i) => i === index ? { ...l, ...patch } : l))
  }

  function addLocation() {
    setLocations(prev => [...prev, newLocationDraft(prev.length)])
  }

  function removeLocation(index: number) {
    setLocations(prev => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, sort_order: i })))
  }

  function addInterest() {
    setInterests(prev => [...prev, {
      destination_city: '', destination_country: 'United States',
      destination_lat: null, destination_lng: null,
      notes: '', interest_start_date: '', interest_end_date: '', intent: '',
    }])
  }

  function removeInterest(index: number) {
    setInterests(prev => prev.filter((_, i) => i !== index))
  }

  function updateInterest(index: number, patch: Partial<InterestDraft>) {
    setInterests(prev => prev.map((int, i) => i === index ? { ...int, ...patch } : int))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { data: savedProfile, error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          ...(profile?.id ? { id: profile.id } : {}),
          user_id: userId,
          full_name: fullName,
          section: section || null,
          additional_details: additionalDetails || null,
          can_host: canHost,
          hosting_details: canHost ? (hostingDetails || null) : null,
          open_to_visit: openToVisit,
          photo_url: photoUrl || null,
          has_completed_profile: true,
          activity_tags: Array.from(activityTags),
          trip_style: tripStyle || null,
          group_size_pref: groupSizePref || null,
        })
        .select()
        .single()

      if (profileErr) throw profileErr

      const profileId = savedProfile.id

      await supabase.from('locations').delete().eq('profile_id', profileId)
      const validLocations = locations.filter(l => l.city && l.lat !== null)
      if (validLocations.length) {
        const { error: locErr } = await supabase.from('locations').insert(
          validLocations.map((l, i) => ({
            profile_id: profileId,
            city: l.city,
            city_ascii: l.city_ascii,
            state: l.state,
            country: l.country,
            lat: l.lat!,
            lng: l.lng!,
            start_date: l.start_date || null,
            end_date: l.end_date || null,
            sort_order: i,
            label: l.label || null,
            company: l.company || null,
            role: l.role || null,
            so_name: l.so_name || null,
          }))
        )
        if (locErr) throw locErr
      }

      await supabase.from('travel_interests').delete().eq('profile_id', profileId)
      const validInterests = interests.filter(i => i.destination_city)
      if (validInterests.length) {
        const { error: intErr } = await supabase.from('travel_interests').insert(
          validInterests.map(i => ({
            profile_id: profileId,
            destination_city: i.destination_city,
            destination_country: i.destination_country,
            destination_lat: i.destination_lat,
            destination_lng: i.destination_lng,
            notes: i.notes || null,
            interest_start_date: i.interest_start_date || null,
            interest_end_date: i.interest_end_date || null,
            intent: i.intent || null,
          }))
        )
        if (intErr) throw intErr
      }

      if (isNewUser) {
        router.push('/map')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const showCompanyRole = (label: string) => label === 'Summer Internship' || label === 'Other'

  return (
    <div className="space-y-8">
      {/* Welcome banner for new users */}
      {isNewUser && (
        <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5 mb-2">
          <h2 className="font-semibold text-primary mb-1">Welcome to GSB Summer &#39;26!</h2>
          <p className="text-sm text-muted-foreground">
            Fill out your summer plans below. Once you save, you&#39;ll be able to see
            where all your classmates are headed this summer.
          </p>
        </div>
      )}

      {/* Overlap banner */}
      {overlaps.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex gap-3">
          <Users size={16} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-primary">
              {overlaps.length} classmate{overlaps.length > 1 ? 's' : ''} share your location this summer!
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overlaps.slice(0, 3).map(o => o.name).join(', ')}
              {overlaps.length > 3 ? ` +${overlaps.length - 3} more` : ''}
            </p>
          </div>
        </div>
      )}

      {/* About Me */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">About me</h2>

        <div className="flex items-center gap-4">
          <div className={`relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white font-semibold text-lg shrink-0 ${avatarColor(profile?.full_name || 'A')}`}>
            {photoUrl
              ? <Image src={photoUrl} alt="Avatar" fill className="object-cover" unoptimized />
              : getInitials(fullName || '?')
            }
          </div>
          <label className="cursor-pointer">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent transition">
              {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Full name *</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Hometown <span className="text-muted-foreground/60">(optional)</span></label>
            <input
              value={section}
              onChange={e => setSection(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Denver, CO"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Additional details</label>
            <textarea
              value={additionalDetails}
              onChange={e => setAdditionalDetails(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Anything your classmates should know — where in the city you'll be, best way to reach you, fun plans, etc."
            />
          </div>
        </div>
      </section>

      {/* Hosting & Visiting */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Hosting &amp; Visiting</h2>

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={canHost} onChange={e => setCanHost(e.target.checked)}
              className="w-4 h-4 rounded accent-primary" />
            <span className="text-sm font-medium">I can host visiting classmates</span>
          </label>
          {canHost && (
            <input
              value={hostingDetails}
              onChange={e => setHostingDetails(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Guest bed, air mattress, couch — let them know what you've got"
            />
          )}
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={openToVisit} onChange={e => setOpenToVisit(e.target.checked)}
            className="w-4 h-4 rounded accent-primary" />
          <span className="text-sm font-medium">I&#39;m open to visiting / couch-surfing with classmates</span>
        </label>
      </section>

      {/* Travel Preferences */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Travel preferences</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Help classmates find their best travel match.</p>
        </div>

        {/* Activity tags */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Activities you enjoy</label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleActivityTag(tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  activityTags.has(tag)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Trip style */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Travel style</label>
          <div className="flex flex-wrap gap-1.5">
            {TRIP_STYLES.map(style => (
              <button
                key={style}
                type="button"
                onClick={() => setTripStyle(s => s === style ? '' : style)}
                className={`px-3 py-1 rounded-full text-xs font-medium border capitalize transition ${
                  tripStyle === style
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Group size preference */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Preferred group size</label>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_SIZE_PREFS.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setGroupSizePref(s => s === size ? '' : size)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                  groupSizePref === size
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Summer Plans */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Summer plans</h2>
          <button
            onClick={addLocation}
            disabled={locations.length >= 10}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent transition disabled:opacity-40"
          >
            <Plus size={12} /> Add experience
          </button>
        </div>

        <div className="space-y-3">
          {locations.map((loc, i) => (
            <div key={i} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {loc.label || `Experience ${i + 1}`}
                </span>
                {locations.length > 1 && (
                  <button
                    onClick={() => removeLocation(i)}
                    className="text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  value={loc.label}
                  onChange={e => updateLocation(i, { label: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {EXPERIENCE_LABELS.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {showCompanyRole(loc.label) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Company (optional)</label>
                    <input
                      value={loc.company}
                      onChange={e => updateLocation(i, { company: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Role (optional)</label>
                    <input
                      value={loc.role}
                      onChange={e => updateLocation(i, { role: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Intern"
                    />
                  </div>
                </div>
              )}

              <CityAutocomplete
                value={loc.city}
                onChange={result => {
                  if (result) {
                    updateLocation(i, {
                      city: result.city,
                      city_ascii: result.city,
                      state: result.state,
                      country: result.country,
                      lat: result.lat,
                      lng: result.lng,
                    })
                  } else {
                    updateLocation(i, { city: '', lat: null, lng: null })
                  }
                }}
                placeholder="Search city…"
              />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Start date <span className="text-muted-foreground/60">(leave blank if TBD)</span></label>
                  <input
                    type="date"
                    value={loc.start_date}
                    min="2026-06-01"
                    max="2026-09-14"
                    onChange={e => updateLocation(i, { start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">End date <span className="text-muted-foreground/60">(leave blank if TBD)</span></label>
                  <input
                    type="date"
                    value={loc.end_date}
                    min="2026-06-01"
                    max="2026-09-14"
                    onChange={e => updateLocation(i, { end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Significant other joining? <span className="text-muted-foreground/60">(optional — first name only)</span></label>
                <input
                  value={loc.so_name}
                  onChange={e => updateLocation(i, { so_name: e.target.value })}
                  placeholder="e.g. Gracie"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Travel interests */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Travel interests</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Places you&#39;d love to visit — we&#39;ll match you with classmates who agree.</p>
          </div>
          <button
            onClick={addInterest}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent transition"
          >
            <Plus size={12} /> Add destination
          </button>
        </div>

        {interests.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No travel interests yet. Add destinations you&#39;d love to explore with classmates.
          </p>
        )}

        <div className="space-y-3">
          {interests.map((interest, i) => (
            <div key={i} className="rounded-xl border border-border bg-background p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Destination {i + 1}</span>
                <button onClick={() => removeInterest(i)} className="text-muted-foreground hover:text-destructive transition">
                  <Trash2 size={13} />
                </button>
              </div>
              <CityAutocomplete
                value={interest.destination_city}
                onChange={result => updateInterest(i, {
                  destination_city: result?.city ?? '',
                  destination_country: result?.country ?? 'United States',
                  destination_lat: result?.lat ?? null,
                  destination_lng: result?.lng ?? null,
                })}
                placeholder="Search destination…"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Intent (optional)</label>
                  <select
                    value={interest.intent}
                    onChange={e => updateInterest(i, { intent: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— select —</option>
                    {INTENT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Notes (optional)</label>
                  <input
                    value={interest.notes}
                    onChange={e => updateInterest(i, { notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. late July"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Interested from (optional)</label>
                  <input
                    type="date"
                    value={interest.interest_start_date}
                    onChange={e => updateInterest(i, { interest_start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">To (optional)</label>
                  <input
                    type="date"
                    value={interest.interest_end_date}
                    onChange={e => updateInterest(i, { interest_end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !fullName}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? 'Saved!' : saving ? 'Saving…' : isNewUser ? 'Save & get started' : 'Save profile'}
        </button>
      </div>
    </div>
  )
}

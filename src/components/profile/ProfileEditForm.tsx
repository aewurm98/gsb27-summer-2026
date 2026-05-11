'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { CityAutocomplete } from './CityAutocomplete'
import { Profile, Location, TravelInterest } from '@/lib/types'
import { getOverlappingClassmates, formatDateRange, avatarColor, getInitials } from '@/lib/utils'
import { Plus, Trash2, GripVertical, Save, Users, Loader2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
}

interface InterestDraft {
  id?: string
  destination_city: string
  destination_country: string
  destination_lat: number | null
  destination_lng: number | null
  notes: string
}

type AllProfile = Pick<Profile, 'id' | 'full_name'> & { locations: Location[] }

function newLocationDraft(order: number): LocationDraft {
  return { city: '', city_ascii: null, state: null, country: 'United States', lat: null, lng: null, start_date: '', end_date: '', sort_order: order }
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

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? '')
  const [section, setSection] = useState(profile?.section ?? '')
  const [preMbaCompany, setPreMbaCompany] = useState(profile?.pre_mba_company ?? '')
  const [preMbaRole, setPreMbaRole] = useState(profile?.pre_mba_role ?? '')
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url ?? '')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [locations, setLocations] = useState<LocationDraft[]>(
    profile?.locations?.length
      ? profile.locations
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(l => ({ ...l, start_date: l.start_date ?? '', end_date: l.end_date ?? '' }))
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
    })) ?? []
  )

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
    setInterests(prev => [...prev, { destination_city: '', destination_country: 'United States', destination_lat: null, destination_lng: null, notes: '' }])
  }

  function removeInterest(index: number) {
    setInterests(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Upsert profile
      const { data: savedProfile, error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          ...(profile?.id ? { id: profile.id } : {}),
          user_id: userId,
          full_name: fullName,
          bio,
          linkedin_url: linkedinUrl || null,
          section: section || null,
          pre_mba_company: preMbaCompany || null,
          pre_mba_role: preMbaRole || null,
          photo_url: photoUrl || null,
        })
        .select()
        .single()

      if (profileErr) throw profileErr

      const profileId = savedProfile.id

      // Replace locations
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
          }))
        )
        if (locErr) throw locErr
      }

      // Replace travel interests
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
          }))
        )
        if (intErr) throw intErr
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

  return (
    <div className="space-y-8">
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

      {/* Bio section */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">About me</h2>

        {/* Photo upload */}
        <div className="flex items-center gap-4">
          <div className={`relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white font-semibold text-lg shrink-0 ${avatarColor(fullName || 'A')}`}>
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
              placeholder="Alex Wurm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">GSB Section</label>
            <input
              value={section}
              onChange={e => setSection(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Section A"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Pre-MBA company</label>
            <input
              value={preMbaCompany}
              onChange={e => setPreMbaCompany(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Goldman Sachs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Pre-MBA role</label>
            <input
              value={preMbaRole}
              onChange={e => setPreMbaRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Analyst"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">LinkedIn URL</label>
            <input
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://linkedin.com/in/your-name"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Tell classmates a bit about yourself and what you're up to this summer…"
            />
          </div>
        </div>
      </section>

      {/* Summer itinerary */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Summer itinerary</h2>
          <button
            onClick={addLocation}
            disabled={locations.length >= 5}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent transition disabled:opacity-40"
          >
            <Plus size={12} /> Add stop
          </button>
        </div>

        <div className="space-y-3">
          {locations.map((loc, i) => (
            <div key={i} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <GripVertical size={12} />
                  Stop {i + 1}
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
                  <label className="text-xs text-muted-foreground">Start date</label>
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
                  <label className="text-xs text-muted-foreground">End date</label>
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
            </div>
          ))}
        </div>
      </section>

      {/* Travel interests */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Travel interests</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Places you'd love to visit — we'll match you with classmates who agree.</p>
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
            No travel interests yet. Add destinations you'd love to explore with classmates.
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
                onChange={result => {
                  setInterests(prev => prev.map((int, idx) =>
                    idx === i
                      ? { ...int, destination_city: result?.city ?? '', destination_country: result?.country ?? 'United States', destination_lat: result?.lat ?? null, destination_lng: result?.lng ?? null }
                      : int
                  ))
                }}
                placeholder="Search destination…"
              />
              <input
                value={interest.notes}
                onChange={e => setInterests(prev => prev.map((int, idx) => idx === i ? { ...int, notes: e.target.value } : int))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Notes (optional)"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !fullName}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  )
}

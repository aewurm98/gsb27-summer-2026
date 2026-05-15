'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Trek, TrekInterest, Profile } from '@/lib/types'
import { formatDateRange, avatarColor, getInitials } from '@/lib/utils'
import { MapPin, Calendar, Users, Plus, Check, X, Loader2, Plane, Sparkles, DollarSign } from 'lucide-react'
import { CityAutocomplete } from '@/components/profile/CityAutocomplete'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SuggestedDestination } from '@/app/(main)/treks/page'

const ACTIVITY_TAGS = [
  'hiking', 'surfing', 'skiing', 'cycling', 'running', 'yoga',
  'food & wine', 'nightlife', 'art & culture', 'history', 'beaches',
  'mountains', 'cities', 'road trips', 'backpacking', 'luxury',
] as const

const COST_TIERS = ['budget', 'moderate', 'premium'] as const

function CostIcon({ tier }: { tier: string | null }) {
  if (!tier) return null
  const count = tier === 'budget' ? 1 : tier === 'moderate' ? 2 : 3
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title={`Cost: ${tier}`}>
      {Array.from({ length: count }).map((_, i) => (
        <DollarSign key={i} size={9} className="text-amber-500" />
      ))}
    </span>
  )
}

type FullTrek = Trek & {
  trek_interests: (TrekInterest & { profile: Pick<Profile, 'id' | 'full_name' | 'photo_url'> | undefined })[]
}

interface Props {
  treks: FullTrek[]
  myProfileId: string | null
  isAdmin: boolean
  suggestedDestinations: SuggestedDestination[]
}

export function TreksClient({ treks: initialTreks, myProfileId, isAdmin, suggestedDestinations }: Props) {
  const [treks, setTreks] = useState(initialTreks)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const [newTrek, setNewTrek] = useState({
    title: '',
    destination_city: '',
    destination_country: 'United States',
    destination_lat: null as number | null,
    destination_lng: null as number | null,
    proposed_start: '',
    proposed_end: '',
    description: '',
    activity_tags: new Set<string>(),
    cost_tier: '' as string,
    max_group_size: '' as string,
  })

  function toggleNewTag(tag: string) {
    setNewTrek(prev => {
      const next = new Set(prev.activity_tags)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return { ...prev, activity_tags: next }
    })
  }

  function prefillFromSuggestion(dest: SuggestedDestination) {
    setNewTrek(prev => ({
      ...prev,
      title: `${dest.city} Trek`,
      destination_city: dest.city,
      destination_country: dest.country,
      destination_lat: dest.lat,
      destination_lng: dest.lng,
    }))
    setShowCreateForm(true)
  }

  async function handleInterest(trekId: string, status: 'interested' | 'declined') {
    if (!myProfileId) return
    const existing = treks.find(t => t.id === trekId)?.trek_interests.find(i => i.profile_id === myProfileId)

    if (existing) {
      if (existing.status === status) {
        await supabase.from('trek_interests').delete().eq('id', existing.id)
      } else {
        await supabase.from('trek_interests').update({ status }).eq('id', existing.id)
      }
    } else {
      await supabase.from('trek_interests').insert({ trek_id: trekId, profile_id: myProfileId, status })
    }
    router.refresh()
  }

  async function handleCreateTrek() {
    if (!newTrek.title || !newTrek.destination_city || !myProfileId) return
    setCreating(true)
    try {
      await supabase.from('treks').insert({
        title: newTrek.title,
        destination_city: newTrek.destination_city,
        destination_country: newTrek.destination_country,
        destination_lat: newTrek.destination_lat,
        destination_lng: newTrek.destination_lng,
        proposed_start: newTrek.proposed_start || null,
        proposed_end: newTrek.proposed_end || null,
        description: newTrek.description || null,
        activity_tags: Array.from(newTrek.activity_tags),
        cost_tier: newTrek.cost_tier || null,
        max_group_size: newTrek.max_group_size ? Number(newTrek.max_group_size) : null,
        created_by: myProfileId,
      })
      setShowCreateForm(false)
      setNewTrek({
        title: '', destination_city: '', destination_country: 'United States',
        destination_lat: null, destination_lng: null, proposed_start: '', proposed_end: '',
        description: '', activity_tags: new Set(), cost_tier: '', max_group_size: '',
      })
      router.refresh()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <Plus size={14} /> New trek
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-2xl border border-primary/30 bg-card p-6 space-y-4">
          <h3 className="font-semibold">Create new trek</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trek title *</label>
              <input
                value={newTrek.title}
                onChange={e => setNewTrek(p => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Pacific Northwest Road Trip"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Destination *</label>
              <CityAutocomplete
                value={newTrek.destination_city}
                onChange={r => setNewTrek(p => ({
                  ...p,
                  destination_city: r?.city ?? '',
                  destination_country: r?.country ?? 'United States',
                  destination_lat: r?.lat ?? null,
                  destination_lng: r?.lng ?? null,
                }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Proposed start</label>
              <input type="date" value={newTrek.proposed_start} onChange={e => setNewTrek(p => ({ ...p, proposed_start: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Proposed end</label>
              <input type="date" value={newTrek.proposed_end} onChange={e => setNewTrek(p => ({ ...p, proposed_end: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cost tier</label>
              <select value={newTrek.cost_tier} onChange={e => setNewTrek(p => ({ ...p, cost_tier: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— select —</option>
                {COST_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Max group size</label>
              <input type="number" min={2} max={50} value={newTrek.max_group_size}
                onChange={e => setNewTrek(p => ({ ...p, max_group_size: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. 12" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Activity tags</label>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_TAGS.map(tag => (
                  <button key={tag} type="button" onClick={() => toggleNewTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                      newTrek.activity_tags.has(tag)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={newTrek.description}
                onChange={e => setNewTrek(p => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Tell classmates what this trek is about…"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-accent transition">
              Cancel
            </button>
            <button
              onClick={handleCreateTrek}
              disabled={creating || !newTrek.title || !newTrek.destination_city}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : null}
              Create trek
            </button>
          </div>
        </div>
      )}

      {/* Suggested treks (destinations with 3+ interested classmates, not yet a trek) */}
      {suggestedDestinations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <h2 className="text-sm font-semibold">Suggested by classmate interest</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {suggestedDestinations.map(dest => (
              <div key={dest.city} className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{dest.city}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Users size={10} />
                      {dest.interestedProfiles.length} classmates interested
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => prefillFromSuggestion(dest)}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
                    >
                      <Plus size={11} /> Create trek
                    </button>
                  )}
                </div>
                {/* Avatar stack */}
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex -space-x-2">
                    {dest.interestedProfiles.slice(0, 5).map(p => (
                      <div
                        key={p.id}
                        className={`relative w-6 h-6 rounded-full border-2 border-card overflow-hidden flex items-center justify-center text-white text-xs font-semibold ${avatarColor(p.full_name)}`}
                        title={p.full_name}
                      >
                        {p.photo_url
                          ? <Image src={p.photo_url} alt={p.full_name} fill className="object-cover" unoptimized />
                          : getInitials(p.full_name)
                        }
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dest.interestedProfiles.slice(0, 2).map(p => p.full_name.split(' ')[0]).join(', ')}
                    {dest.interestedProfiles.length > 2 ? ` +${dest.interestedProfiles.length - 2}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trek list */}
      {treks.length === 0 ? (
        <div className="text-center space-y-4 py-12">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Plane size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Treks coming soon</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              We&#39;re coordinating group trips based on classmate interest.
              Add destinations to your <Link href="/profile/edit" className="text-primary underline underline-offset-2">travel interests</Link> and
              we&#39;ll organize treks when we have critical mass.
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowCreateForm(true)} className="mt-2 text-sm text-primary hover:underline">
              Create the first trek
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {treks.map(trek => {
            const myInterest = trek.trek_interests.find(i => i.profile_id === myProfileId)
            const interested = trek.trek_interests.filter(i => i.status !== 'declined')
            const confirmed = trek.trek_interests.filter(i => i.status === 'confirmed')

            return (
              <div key={trek.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{trek.title}</h3>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin size={10} />
                        {trek.destination_city}
                        {trek.destination_country !== 'United States' ? `, ${trek.destination_country}` : ''}
                      </span>
                      {(trek.proposed_start || trek.proposed_end) && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar size={10} />
                          {formatDateRange(trek.proposed_start, trek.proposed_end)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users size={10} />
                        {interested.length} interested{confirmed.length > 0 ? `, ${confirmed.length} confirmed` : ''}
                        {trek.max_group_size ? ` · max ${trek.max_group_size}` : ''}
                      </span>
                      {trek.cost_tier && <CostIcon tier={trek.cost_tier} />}
                    </div>
                    {trek.description && (
                      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{trek.description}</p>
                    )}
                    {/* Activity tags */}
                    {trek.activity_tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {trek.activity_tags.map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {myProfileId && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleInterest(trek.id, 'interested')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                          myInterest?.status === 'interested' || myInterest?.status === 'confirmed'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <Check size={12} /> Interested
                      </button>
                    </div>
                  )}
                </div>

                {/* Avatar stack */}
                {interested.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <div className="flex -space-x-2">
                      {interested.slice(0, 6).map(i => (
                        <div
                          key={i.id}
                          className={`relative w-7 h-7 rounded-full border-2 border-card overflow-hidden flex items-center justify-center text-white text-xs font-semibold ${avatarColor(i.profile?.full_name ?? '')}`}
                          title={i.profile?.full_name}
                        >
                          {i.profile?.photo_url
                            ? <Image src={i.profile.photo_url} alt={i.profile?.full_name ?? ''} fill className="object-cover" unoptimized />
                            : getInitials(i.profile?.full_name ?? '')
                          }
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {interested.slice(0, 2).map(i => i.profile?.full_name?.split(' ')[0] ?? '').join(', ')}
                      {interested.length > 2 ? ` +${interested.length - 2} more` : ''}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

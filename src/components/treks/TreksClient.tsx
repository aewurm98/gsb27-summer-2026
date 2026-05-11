'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trek, TrekInterest, Profile } from '@/lib/types'
import { formatDateRange, avatarColor, getInitials } from '@/lib/utils'
import { MapPin, Calendar, Users, Plus, Check, X, Loader2 } from 'lucide-react'
import { CityAutocomplete } from '@/components/profile/CityAutocomplete'
import { useRouter } from 'next/navigation'

type FullTrek = Trek & {
  trek_interests: (TrekInterest & { profile: Pick<Profile, 'id' | 'full_name' | 'photo_url'> })[]
}

interface Props {
  treks: FullTrek[]
  myProfileId: string | null
  isAdmin: boolean
}

export function TreksClient({ treks: initialTreks, myProfileId, isAdmin }: Props) {
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
  })

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
        ...newTrek,
        created_by: myProfileId,
        proposed_start: newTrek.proposed_start || null,
        proposed_end: newTrek.proposed_end || null,
      })
      setShowCreateForm(false)
      setNewTrek({ title: '', destination_city: '', destination_country: 'United States', destination_lat: null, destination_lng: null, proposed_start: '', proposed_end: '', description: '' })
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

      {/* Trek list */}
      {treks.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MapPin size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No treks yet — check back soon!</p>
          {isAdmin && (
            <button onClick={() => setShowCreateForm(true)} className="mt-4 text-sm text-primary hover:underline">
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
                      </span>
                    </div>
                    {trek.description && (
                      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{trek.description}</p>
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
                          className={`w-7 h-7 rounded-full border-2 border-card overflow-hidden flex items-center justify-center text-white text-xs font-semibold ${avatarColor(i.profile.full_name)}`}
                          title={i.profile.full_name}
                        >
                          {i.profile.photo_url
                            ? <img src={i.profile.photo_url} alt={i.profile.full_name} className="w-full h-full object-cover" />
                            : getInitials(i.profile.full_name)
                          }
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {interested.slice(0, 2).map(i => i.profile.full_name.split(' ')[0]).join(', ')}
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

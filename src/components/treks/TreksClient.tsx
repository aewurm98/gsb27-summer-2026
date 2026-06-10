'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Trek, TrekInterest, Profile } from '@/lib/types'
import { formatDateRange, avatarColor, getInitials } from '@/lib/utils'
import { MapPin, Calendar, Users, Plus, Check, X, Loader2, Plane, Sparkles, DollarSign, UserPlus, Search, ArrowRight, Mail } from 'lucide-react'
import { CityAutocomplete } from '@/components/profile/CityAutocomplete'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SuggestedDestination } from '@/app/(main)/treks/page'

const ACTIVITY_TAGS = [
  // Outdoors
  'hiking', 'backpacking', 'cycling', 'rock climbing', 'surfing', 'water sports', 'beaches', 'snow sports', 'golf', 'camping',
  // Food & Drink
  'fine dining', 'street food & markets', 'wine & cocktails', 'craft beer', 'cooking classes',
  // Arts & Culture
  'museums & galleries', 'live music & concerts', 'theater & performance', 'historical sites', 'photography',
  // Wellness
  'yoga & pilates', 'running', 'fitness & gym', 'spa & wellness',
  // Sports & Recreation
  'tennis', 'pickleball', 'swimming', 'volleyball & beach sports',
  // Nightlife & Social
  'bars & nightlife', 'sports events', 'rooftop lounges', 'festivals & events', 'comedy shows',
  // Travel
  'road trips', 'sailing & boating',
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
  allProfiles: Array<{ id: string; full_name: string; photo_url: string | null; email: string | null }>
  interestsByCity: Record<string, string[]>
}

export function TreksClient({ treks: initialTreks, myProfileId, isAdmin, suggestedDestinations, allProfiles, interestsByCity }: Props) {
  const [treks, setTreks] = useState(initialTreks)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  // Suggested-destination date hints keyed by city name
  const [suggestDates, setSuggestDates] = useState<Record<string, { start: string; end: string }>>({})
  // Admin member-picker state: trekId → search query
  const [addMemberTrekId, setAddMemberTrekId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  // Invite panel state
  const [inviteTrekId, setInviteTrekId] = useState<string | null>(null)
  const [inviteSelected, setInviteSelected] = useState<Set<string>>(new Set())
  const [inviteSearch, setInviteSearch] = useState('')
  const supabase = createClient()
  const router = useRouter()

  function openInvitePanel(trek: FullTrek) {
    const preSelected = new Set(
      (interestsByCity[trek.destination_city.toLowerCase()] ?? []).filter(
        id => id !== myProfileId
      )
    )
    setInviteSelected(preSelected)
    setInviteSearch('')
    setInviteTrekId(trek.id)
  }

  function buildMailtoLink(trek: FullTrek, selectedIds: Set<string>, myName: string) {
    const invitees = allProfiles.filter(p => selectedIds.has(p.id))
    const emails = invitees.map(p => p.email).filter(Boolean).join(',')
    const othersCount = invitees.length - 1
    const mysteryLine = othersCount > 0
      ? `${othersCount} other GSB classmate${othersCount === 1 ? '' : 's'} ${othersCount === 1 ? 'is' : 'are'} already curious about this trip.`
      : 'Be the first from our class to join!'
    const trekUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/treks`
    const subject = encodeURIComponent(`Trek to ${trek.destination_city} this summer?`)
    const body = encodeURIComponent(
`Hi there,

${myName} here — I'm organizing a group trek to ${trek.destination_city} this summer and would love for you to join!

${mysteryLine} Don't miss out →
${trekUrl}

Once you click through, you can mark yourself as interested (or not) and see exactly who else is in.

Looking forward to it,
${myName}`)
    return `mailto:${emails}?subject=${subject}&body=${body}`
  }

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

  function prefillFromSuggestion(dest: SuggestedDestination, startDate?: string, endDate?: string) {
    setNewTrek(prev => ({
      ...prev,
      title: `${dest.city} Trek`,
      destination_city: dest.city,
      destination_country: dest.country,
      destination_lat: dest.lat,
      destination_lng: dest.lng,
      proposed_start: startDate ?? '',
      proposed_end: endDate ?? '',
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

  async function handleAddMember(trekId: string, profileId: string) {
    if (!isAdmin) return
    setAddingMember(true)
    const existing = treks.find(t => t.id === trekId)?.trek_interests.find(i => i.profile_id === profileId)
    if (!existing) {
      await supabase.from('trek_interests').insert({ trek_id: trekId, profile_id: profileId, status: 'interested' })
    }
    setAddMemberTrekId(null)
    setMemberSearch('')
    setAddingMember(false)
    router.refresh()
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
            <span className="text-xs text-muted-foreground">— step up as group lead to kick one off</span>
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
                  {/* Admins see "Create trek"; any logged-in classmate sees "I'll lead this" */}
                  {myProfileId && (
                    <button
                      onClick={() => prefillFromSuggestion(dest, suggestDates[dest.city]?.start, suggestDates[dest.city]?.end)}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
                    >
                      <Plus size={11} /> {isAdmin ? 'Create trek' : "I'll lead this"}
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
                {/* Date suggestion row — pre-fills the create-trek form */}
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Suggest dates:</span>
                  <input
                    type="date"
                    className="text-xs px-2 py-1 rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    onChange={e => setSuggestDates(prev => ({ ...prev, [dest.city]: { ...prev[dest.city], start: e.target.value } }))}
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="date"
                    className="text-xs px-2 py-1 rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    onChange={e => setSuggestDates(prev => ({ ...prev, [dest.city]: { ...prev[dest.city], end: e.target.value } }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trek list */}
      {treks.length === 0 ? (
        <div className="space-y-6 py-8">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Plane size={18} className="text-primary" />
              </div>
              <h3 className="font-semibold mb-1">Signal your travel interests</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add destinations to your profile. When 2+ classmates share a destination it
                appears here as a suggested trek — and anyone can step up to lead it.
              </p>
              <Link href="/profile/edit#interests"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
                Add travel interests <ArrowRight size={13} />
              </Link>
            </div>
            {myProfileId && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <Users size={18} className="text-primary" />
                </div>
                <h3 className="font-semibold mb-1">Propose a group trek</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Have a destination in mind? Propose it and rally classmates around it —
                  no admin needed.
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-accent transition">
                  <Plus size={13} /> Propose a trek
                </button>
              </div>
            )}
          </div>
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
                    {/* Group lead */}
                    {(() => {
                      const lead = allProfiles.find(p => p.id === trek.created_by)
                      if (!lead) return null
                      return (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <UserPlus size={10} />
                          Led by <span className="font-medium text-foreground">{lead.full_name}</span>
                        </p>
                      )
                    })()}
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

                  <div className="flex gap-2 shrink-0 items-start">
                    {myProfileId && (
                      <button
                        onClick={() => handleInterest(trek.id, 'interested')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                          myInterest?.status === 'interested' || myInterest?.status === 'confirmed'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <Check size={12} /> {myInterest?.status === 'confirmed' ? 'Confirmed' : 'Interested'}
                      </button>
                    )}
                    {/* Invite button — visible to trek creator and admins */}
                    {(isAdmin || trek.created_by === myProfileId) && myProfileId && (
                      <button
                        onClick={() => inviteTrekId === trek.id ? setInviteTrekId(null) : openInvitePanel(trek)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-border hover:bg-accent transition"
                        title="Invite classmates to this trek"
                      >
                        <Mail size={12} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => { setAddMemberTrekId(trek.id); setMemberSearch('') }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-border hover:bg-accent transition"
                        title="Add a classmate to this trek"
                      >
                        <UserPlus size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Avatar stack */}
                {interested.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <div className="flex -space-x-2">
                      {interested.slice(0, 6).map(i => (
                        <div
                          key={i.id}
                          className={`relative w-7 h-7 rounded-full border-2 border-card overflow-hidden flex items-center justify-center text-white text-xs font-semibold ${avatarColor(i.profile?.full_name ?? '')}`}
                          title={`${i.profile?.full_name}${i.status === 'confirmed' ? ' ✓' : ''}`}
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
                      {confirmed.length > 0 ? ` · ${confirmed.length} confirmed` : ''}
                    </p>
                  </div>
                )}

                {/* Invite classmates panel */}
                {inviteTrekId === trek.id && (() => {
                  const myProfile = allProfiles.find(p => p.id === myProfileId)
                  const myName = myProfile?.full_name ?? 'A classmate'
                  const filtered = allProfiles.filter(p =>
                    p.id !== myProfileId &&
                    (inviteSearch === '' || p.full_name.toLowerCase().includes(inviteSearch.toLowerCase()))
                  )
                  const withInterest = filtered.filter(p => interestsByCity[trek.destination_city.toLowerCase()]?.includes(p.id))
                  const withoutInterest = filtered.filter(p => !interestsByCity[trek.destination_city.toLowerCase()]?.includes(p.id))
                  const orderedProfiles = [...withInterest, ...withoutInterest]
                  const othersCount = inviteSelected.size - 1

                  return (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold">Invite classmates</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Pre-selected: classmates with matching travel interests
                          </p>
                        </div>
                        <button onClick={() => setInviteTrekId(null)} className="text-muted-foreground hover:text-foreground">
                          <X size={13} />
                        </button>
                      </div>

                      {/* Search */}
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          value={inviteSearch}
                          onChange={e => setInviteSearch(e.target.value)}
                          placeholder="Filter classmates…"
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>

                      {/* Classmate list */}
                      <div className="rounded-lg border border-border bg-card overflow-hidden max-h-52 overflow-y-auto divide-y divide-border">
                        {orderedProfiles.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No classmates found</p>
                        ) : orderedProfiles.map(p => {
                          const hasInterest = interestsByCity[trek.destination_city.toLowerCase()]?.includes(p.id)
                          const selected = inviteSelected.has(p.id)
                          return (
                            <button
                              key={p.id}
                              onClick={() => setInviteSelected(prev => {
                                const next = new Set(prev)
                                next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                                return next
                              })}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent text-xs transition"
                            >
                              <div className={`w-5 h-5 rounded flex items-center justify-center border transition shrink-0 ${
                                selected ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-background'
                              }`}>
                                {selected && <Check size={10} />}
                              </div>
                              <div className={`relative w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${avatarColor(p.full_name)}`}>
                                {p.photo_url
                                  ? <Image src={p.photo_url} alt={p.full_name} fill className="object-cover" unoptimized />
                                  : getInitials(p.full_name)
                                }
                              </div>
                              <span className="flex-1 truncate font-medium">{p.full_name}</span>
                              {hasInterest && (
                                <span className="text-[10px] text-primary font-medium shrink-0">interested</span>
                              )}
                              {!p.email && (
                                <span className="text-[10px] text-muted-foreground shrink-0">no email</span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Email preview */}
                      {inviteSelected.size > 0 && (() => {
                        const invitees = allProfiles.filter(p => inviteSelected.has(p.id))
                        const withEmail = invitees.filter(p => p.email)
                        const noEmail = invitees.filter(p => !p.email)
                        return (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-primary">Email preview</p>
                              <span className="text-[10px] text-muted-foreground">
                                {withEmail.length} of {invitees.length} have emails on file
                              </span>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p><span className="font-medium text-foreground">To:</span> {
                                withEmail.slice(0, 3).map(p => p.full_name.split(' ')[0]).join(', ')
                              }{withEmail.length > 3 ? ` +${withEmail.length - 3} more` : ''}</p>
                              <p><span className="font-medium text-foreground">Subject:</span> Trek to {trek.destination_city} this summer?</p>
                              <div className="mt-1.5 p-2 rounded-lg bg-background border border-border text-[11px] leading-relaxed">
                                <p>Hi there,</p>
                                <p className="mt-1">{myName} here — I'm organizing a group trek to <strong>{trek.destination_city}</strong> this summer and would love for you to join!</p>
                                <p className="mt-1 font-medium text-primary">
                                  {othersCount > 0
                                    ? `${othersCount} other GSB classmate${othersCount === 1 ? '' : 's'} ${othersCount === 1 ? 'is' : 'are'} already curious about this trip.`
                                    : 'Be the first from our class to join!'}
                                  {' '}Don't miss out →
                                </p>
                                <p className="mt-1 text-muted-foreground italic">[link to trek page]</p>
                              </div>
                            </div>
                            {noEmail.length > 0 && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                {noEmail.length} selected {noEmail.length === 1 ? 'classmate has' : 'classmates have'} no email on file and will be skipped.
                              </p>
                            )}
                            <a
                              href={buildMailtoLink(trek, inviteSelected, myName)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
                            >
                              <Mail size={11} /> Open in mail app ({withEmail.length} recipient{withEmail.length !== 1 ? 's' : ''})
                            </a>
                          </div>
                        )
                      })()}

                      {inviteSelected.size === 0 && (
                        <p className="text-[11px] text-muted-foreground">Select at least one classmate to draft the invite.</p>
                      )}
                    </div>
                  )
                })()}

                {/* Admin: inline member picker */}
                {isAdmin && addMemberTrekId === trek.id && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Add classmate to trek</p>
                      <button onClick={() => setAddMemberTrekId(null)} className="text-muted-foreground hover:text-foreground">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        autoFocus
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search by name…"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    {memberSearch.length >= 1 && (
                      <div className="rounded-lg border border-border bg-card overflow-hidden max-h-48 overflow-y-auto">
                        {allProfiles
                          .filter(p =>
                            p.full_name.toLowerCase().includes(memberSearch.toLowerCase()) &&
                            !trek.trek_interests.some(i => i.profile_id === p.id)
                          )
                          .slice(0, 8)
                          .map(p => (
                            <button
                              key={p.id}
                              disabled={addingMember}
                              onClick={() => handleAddMember(trek.id, p.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent text-xs transition disabled:opacity-50"
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${avatarColor(p.full_name)}`}>
                                {getInitials(p.full_name)}
                              </div>
                              <span className="truncate">{p.full_name}</span>
                              <Plus size={11} className="ml-auto shrink-0 text-muted-foreground" />
                            </button>
                          ))
                        }
                        {allProfiles.filter(p =>
                          p.full_name.toLowerCase().includes(memberSearch.toLowerCase()) &&
                          !trek.trek_interests.some(i => i.profile_id === p.id)
                        ).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No matching classmates</p>
                        )}
                      </div>
                    )}
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

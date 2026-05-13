'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, Location, TravelInterest, Trek, TrekInterest } from '@/lib/types'
import { formatDateRange } from '@/lib/utils'
import { Download, Users, MapPin, Compass, Search, TrendingUp, Pencil, Check, X, Plus } from 'lucide-react'
import Link from 'next/link'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'

type FullProfile = Profile & { locations: Location[]; travel_interests: TravelInterest[] }
type FullTrek = Trek & { trek_interests: (TrekInterest & { profile: Pick<Profile, 'id' | 'full_name'> | undefined })[] }

interface Props {
  profiles: FullProfile[]
  treks: FullTrek[]
}

export function AdminClient({ profiles, treks }: Props) {
  const [tab, setTab] = useState<'classmates' | 'treks' | 'insights' | 'profiles'>('classmates')
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Profiles tab state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  async function saveEmail(profileId: string) {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ email: editEmail.trim() || null })
      .eq('id', profileId)
    setSaving(false)
    if (error) {
      alert(`Error saving: ${error.message}`)
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function createProfile() {
    if (!newName.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .insert({
        full_name: newName.trim(),
        email: newEmail.trim() || null,
        has_completed_profile: false,
        is_admin: false,
      })
    setSaving(false)
    if (error) {
      alert(`Error creating: ${error.message}`)
      return
    }
    setNewName('')
    setNewEmail('')
    setAddingNew(false)
    router.refresh()
  }

  function exportCSV() {
    const rows = profiles.flatMap(p =>
      p.locations?.length
        ? p.locations.map((loc, i) => ({
            name: p.full_name,
            section: p.section ?? '',
            can_host: p.can_host ? 'yes' : 'no',
            hosting_details: p.hosting_details ?? '',
            open_to_visit: p.open_to_visit ? 'yes' : 'no',
            experience_order: String(i + 1),
            experience_label: loc.label ?? '',
            company: loc.company ?? '',
            role: loc.role ?? '',
            city: loc.city,
            state: loc.state ?? '',
            country: loc.country,
            lat: String(loc.lat),
            lng: String(loc.lng),
            start_date: loc.start_date ?? '',
            end_date: loc.end_date ?? '',
            travel_interests: p.travel_interests?.map(t => t.destination_city).join('; ') ?? '',
          }))
        : [{
            name: p.full_name,
            section: p.section ?? '',
            can_host: p.can_host ? 'yes' : 'no',
            hosting_details: p.hosting_details ?? '',
            open_to_visit: p.open_to_visit ? 'yes' : 'no',
            experience_order: '',
            experience_label: '',
            company: '',
            role: '',
            city: '',
            state: '',
            country: '',
            lat: '',
            lng: '',
            start_date: '',
            end_date: '',
            travel_interests: p.travel_interests?.map(t => t.destination_city).join('; ') ?? '',
          }]
    )

    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gsb-summer-2026-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredProfiles = profiles.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.section ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const trekInsights = useMemo(() => {
    const cityMap = new Map<string, { city: string; country: string; classmates: string[] }>()
    profiles.forEach(p => {
      p.travel_interests?.forEach(t => {
        const key = `${t.destination_city}|${t.destination_country}`
        if (!cityMap.has(key)) {
          cityMap.set(key, { city: t.destination_city, country: t.destination_country, classmates: [] })
        }
        cityMap.get(key)!.classmates.push(p.full_name)
      })
    })
    return Array.from(cityMap.values())
      .sort((a, b) => b.classmates.length - a.classmates.length)
  }, [profiles])

  const sortedProfiles = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name))

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Users size={12} /> Classmates
          </div>
          <div className="text-2xl font-bold">{profiles.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <MapPin size={12} /> Cities
          </div>
          <div className="text-2xl font-bold">
            {new Set(profiles.flatMap(p => p.locations?.map(l => l.city) ?? [])).size}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Compass size={12} /> Treks
          </div>
          <div className="text-2xl font-bold">{treks.length}</div>
        </div>
      </div>

      {/* Tabs + export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(['classmates', 'profiles', 'treks', 'insights'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-accent transition"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {tab === 'classmates' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search classmates…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Name', 'Hometown', 'Hosting', 'Locations', 'Interests'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProfiles.map(p => (
                  <tr key={p.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/profile/${p.id}`} className="hover:text-primary transition-colors">
                        {p.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.section ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.can_host ? '🏠 Host' : ''}
                      {p.can_host && p.open_to_visit ? ' · ' : ''}
                      {p.open_to_visit ? '✈️ Visitor' : ''}
                      {!p.can_host && !p.open_to_visit ? '—' : ''}
                    </td>
                    <td className="px-4 py-3">
                      {p.locations?.length
                        ? <div className="space-y-0.5">
                            {p.locations.sort((a, b) => a.sort_order - b.sort_order).map(l => (
                              <div key={l.id} className="text-xs text-muted-foreground">
                                {l.city}
                                {l.label ? ` (${l.label})` : ''}
                                {' · '}
                                {formatDateRange(l.start_date, l.end_date)}
                              </div>
                            ))}
                          </div>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {p.travel_interests?.length
                        ? <div className="flex flex-wrap gap-1">
                            {p.travel_interests.map(t => (
                              <span key={t.id} className="text-xs px-1.5 py-0.5 rounded-full bg-accent">
                                {t.destination_city}
                              </span>
                            ))}
                          </div>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Set an email on any unclaimed profile — when that person signs in with that email, the profile is automatically linked to their account.
          </div>

          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Name', 'Email', 'Status', 'Locations'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedProfiles.map(p => (
                  <tr key={p.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/profile/${p.id}`} className="hover:text-primary transition-colors">
                        {p.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editEmail}
                            onChange={e => setEditEmail(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEmail(p.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            placeholder="email@domain.com"
                            className="flex-1 px-2 py-1 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button
                            onClick={() => saveEmail(p.id)}
                            disabled={saving}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded text-muted-foreground hover:bg-accent transition"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={p.email ? 'text-foreground text-sm' : 'text-muted-foreground italic text-sm'}>
                            {p.email ?? 'not set'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingId(p.id)
                              setEditEmail(p.email ?? '')
                            }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition"
                            title="Edit email"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.user_id ? (
                        <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-600 text-white">
                          Claimed
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500 text-white">
                          Pre-seeded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.locations?.length ?? 0}
                    </td>
                  </tr>
                ))}

                {/* Add new profile row */}
                {addingNew && (
                  <tr className="bg-accent/30">
                    <td className="px-4 py-3">
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Full name"
                        className="w-full px-2 py-1 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') createProfile()
                          if (e.key === 'Escape') setAddingNew(false)
                        }}
                        placeholder="email@domain.com (optional)"
                        className="w-full px-2 py-1 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">Pre-seeded</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={createProfile}
                          disabled={saving || !newName.trim()}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition disabled:opacity-40"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => { setAddingNew(false); setNewName(''); setNewEmail('') }}
                          className="p-1 rounded text-muted-foreground hover:bg-accent transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!addingNew && (
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition"
            >
              <Plus size={14} /> Add pre-seeded profile
            </button>
          )}
        </div>
      )}

      {tab === 'treks' && (
        <div className="space-y-4">
          {treks.map(trek => {
            const interested = trek.trek_interests.filter(i => i.status !== 'declined')
            const confirmed = trek.trek_interests.filter(i => i.status === 'confirmed')

            return (
              <div key={trek.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{trek.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {trek.destination_city} · {formatDateRange(trek.proposed_start, trek.proposed_end)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{interested.length} interested</div>
                    <div>{confirmed.length} confirmed</div>
                  </div>
                </div>
                {interested.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {interested.map(i => (
                      <span key={i.id} className={`text-xs px-2 py-0.5 rounded-full ${
                        i.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-accent'
                      }`}>
                        {i.profile?.full_name}
                        {i.status === 'confirmed' ? ' ✓' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp size={14} />
            <span>Top destinations by classmate interest — potential trek candidates</span>
          </div>
          {trekInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No travel interests submitted yet.
            </p>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['Destination', 'Classmates interested', 'Who'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trekInsights.map(insight => (
                    <tr key={`${insight.city}|${insight.country}`} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {insight.city}
                        {insight.country !== 'United States' ? `, ${insight.country}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, insight.classmates.length * 10)}px` }}
                          />
                          <span className="text-muted-foreground">{insight.classmates.length}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {insight.classmates.slice(0, 5).map(name => (
                            <span key={name} className="text-xs px-1.5 py-0.5 rounded-full bg-accent">
                              {name.split(' ')[0]}
                            </span>
                          ))}
                          {insight.classmates.length > 5 && (
                            <span className="text-xs text-muted-foreground">+{insight.classmates.length - 5} more</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, Location, TravelInterest, Trek, TrekInterest } from '@/lib/types'
import { formatDateRange, getSummerWeeks, getLocationAtWeek } from '@/lib/utils'
import { Download, Users, MapPin, Compass, Search, TrendingUp, Pencil, Check, X, Plus, BarChart2, LayoutGrid, ClipboardList } from 'lucide-react'
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
  const [insightsTab, setInsightsTab] = useState<'destinations' | 'heatmap' | 'completeness'>('destinations')
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

  // ─── Phase 4 Analytics ────────────────────────────────────────────────────

  const weeks = getSummerWeeks()

  // Top 10 cities by total presence (for heatmap columns)
  const topCities = useMemo(() => {
    const cityCount = new Map<string, number>()
    profiles.forEach(p =>
      p.locations?.forEach(l => cityCount.set(l.city, (cityCount.get(l.city) ?? 0) + 1))
    )
    return Array.from(cityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city]) => city)
  }, [profiles])

  // Weekly density matrix: weeks × cities
  const weekCityMatrix = useMemo(() =>
    weeks.map(w => ({
      label: w.label,
      dateLabel: w.dateLabel,
      cities: topCities.map(city => ({
        city,
        count: profiles.filter(p => {
          const loc = getLocationAtWeek(p.locations ?? [], w.index)
          return loc?.city === city
        }).length,
      })),
    }))
  , [weeks, topCities, profiles])

  const maxDensity = useMemo(() =>
    Math.max(1, ...weekCityMatrix.flatMap(w => w.cities.map(c => c.count)))
  , [weekCityMatrix])

  // Data completeness scores
  const completenessScores = useMemo(() =>
    sortedProfiles.map(p => {
      let score = 0
      if ((p.locations?.length ?? 0) > 0) score += 30
      if ((p.travel_interests?.length ?? 0) > 0) score += 20
      if (p.photo_url) score += 15
      if (p.section) score += 10
      if (p.additional_details) score += 10
      if (p.can_host || p.open_to_visit) score += 10
      if ((p.activity_tags?.length ?? 0) > 0) score += 5
      return { profile: p, score }
    }).sort((a, b) => a.score - b.score)
  , [sortedProfiles])

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
          {/* Insights sub-tabs */}
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1 w-fit">
            <button onClick={() => setInsightsTab('destinations')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${insightsTab === 'destinations' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <TrendingUp size={11} /> Destinations
            </button>
            <button onClick={() => setInsightsTab('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${insightsTab === 'heatmap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid size={11} /> Weekly heatmap
            </button>
            <button onClick={() => setInsightsTab('completeness')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${insightsTab === 'completeness' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <ClipboardList size={11} /> Completeness
            </button>
          </div>

          {/* Destinations */}
          {insightsTab === 'destinations' && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp size={14} />
                <span>Top destinations by classmate interest — potential trek candidates</span>
              </div>
              {trekInsights.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No travel interests submitted yet.</p>
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
                              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(120, insight.classmates.length * 12)}px` }} />
                              <span className="text-muted-foreground">{insight.classmates.length}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {insight.classmates.slice(0, 5).map(name => (
                                <span key={name} className="text-xs px-1.5 py-0.5 rounded-full bg-accent">{name.split(' ')[0]}</span>
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
            </>
          )}

          {/* Weekly heatmap */}
          {insightsTab === 'heatmap' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2"><BarChart2 size={14} /> Classmates per city per week — top {topCities.length} cities</p>
              {topCities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No location data yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="text-xs min-w-max">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10">Week</th>
                        {topCities.map(city => (
                          <th key={city} className="px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{city}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {weekCityMatrix.map(row => (
                        <tr key={row.label} className="hover:bg-accent/30 transition-colors">
                          <td className="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-card z-10">
                            {row.label} <span className="text-muted-foreground font-normal">({row.dateLabel})</span>
                          </td>
                          {row.cities.map(({ city, count }) => (
                            <td key={city} className="px-3 py-2 text-center">
                              {count > 0 ? (
                                <span
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold"
                                  style={{
                                    backgroundColor: `rgba(var(--primary-rgb, 99,102,241), ${Math.max(0.12, count / maxDensity * 0.85)})`,
                                    color: count / maxDensity > 0.5 ? 'white' : 'inherit',
                                  }}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30">·</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Data completeness */}
          {insightsTab === 'completeness' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Profile completeness — sorted ascending (least complete first)</p>
              <div className="rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Name', 'Score', 'Details'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {completenessScores.map(({ profile: p, score }) => (
                      <tr key={p.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/profile/${p.id}`} className="hover:text-primary transition-colors">{p.full_name}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-9 text-right">{score}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <div className="flex flex-wrap gap-1">
                            {!p.photo_url && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">no photo</span>}
                            {!(p.locations?.length) && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">no locations</span>}
                            {!(p.travel_interests?.length) && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">no interests</span>}
                            {!p.section && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">no hometown</span>}
                            {!(p.activity_tags?.length) && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">no tags</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

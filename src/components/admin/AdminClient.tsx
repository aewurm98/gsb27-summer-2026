'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, Location, TravelInterest, Trek, TrekInterest, SUMMER_START, SUMMER_END } from '@/lib/types'
import { formatDateRange, getSummerWeeks, getLocationAtWeek } from '@/lib/utils'
import { Download, Users, MapPin, Compass, Search, TrendingUp, Pencil, Check, X, Plus, BarChart2, LayoutGrid, ClipboardList, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { CityAutocomplete } from '@/components/profile/CityAutocomplete'
import { useTheme } from 'next-themes'
import type { ImportProfile, ImportResult } from '@/app/api/admin/import-profiles/route'

type FullProfile = Profile & { locations: Location[]; travel_interests: TravelInterest[] }
type FullTrek = Trek & { trek_interests: (TrekInterest & { profile: Pick<Profile, 'id' | 'full_name'> | undefined })[] }

interface Props {
  profiles: FullProfile[]
  treks: FullTrek[]
  isSuperAdmin: boolean
}

interface Stop {
  city: string
  lat: number | null
  lng: number | null
  state: string | null
  country: string
  startDate: string
  endDate: string
  label: string
}

function emptyStop(): Stop {
  return { city: '', lat: null, lng: null, state: null, country: 'United States', startDate: '', endDate: '', label: 'Summer Internship' }
}

// ── AddClassmateForm ──────────────────────────────────────────────────────────
function AddClassmateForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const supabase = createClient()
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newHometown, setNewHometown] = useState('')
  const [stops, setStops] = useState<Stop[]>([emptyStop()])
  const [saving, setSaving] = useState(false)

  function updateStop(i: number, patch: Partial<Stop>) {
    setStops(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  function removeStop(i: number) {
    setStops(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)

    const { data: created, error } = await supabase
      .from('profiles')
      .insert({
        full_name: newName.trim(),
        email: newEmail.trim() || null,
        section: newHometown.trim() || null,
        has_completed_profile: false,
        is_admin: false,
      })
      .select()
      .single()

    if (error) {
      alert(`Error creating: ${error.message}`)
      setSaving(false)
      return
    }

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i]
      if (!stop.city || stop.lat === null || stop.lng === null) continue
      await supabase.from('locations').insert({
        profile_id: created.id,
        city: stop.city,
        city_ascii: stop.city,
        state: stop.state,
        country: stop.country,
        lat: stop.lat,
        lng: stop.lng,
        start_date: stop.startDate || null,
        end_date: stop.endDate || null,
        sort_order: i,
        label: stop.label,
      })
    }

    setSaving(false)
    onSuccess()
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-4">
      <p className="text-sm font-medium">New pre-seeded profile</p>

      {/* Basic info */}
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Full name *"
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="Email (enables auto-claim)"
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={newHometown}
          onChange={e => setNewHometown(e.target.value)}
          placeholder="Hometown (optional)"
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Location stops */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          Summer stops {stops.length > 1 ? `(${stops.length})` : ''}
        </p>
        {stops.map((stop, i) => (
          <div key={i} className="rounded-xl border border-input bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Stop {i + 1}
              </span>
              {stops.length > 1 && (
                <button
                  onClick={() => removeStop(i)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  title="Remove stop"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">City</label>
                <CityAutocomplete
                  value={stop.city}
                  onChange={r => updateStop(i, {
                    city: r?.city ?? '',
                    lat: r?.lat ?? null,
                    lng: r?.lng ?? null,
                    state: r?.state ?? null,
                    country: r?.country ?? 'United States',
                  })}
                  placeholder="Search city…"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Experience type</label>
                <select
                  value={stop.label}
                  onChange={e => updateStop(i, { label: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>Summer Internship</option>
                  <option>Traveling</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start date</label>
                <input type="date" value={stop.startDate} onChange={e => updateStop(i, { startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End date</label>
                <input type="date" value={stop.endDate} onChange={e => updateStop(i, { endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          </div>
        ))}

        {stops.length < 3 && (
          <button
            onClick={() => setStops(prev => [...prev, emptyStop()])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
          >
            <Plus size={12} /> Add another stop
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={saving || !newName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          <Check size={14} /> {saving ? 'Creating…' : 'Create profile'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-accent transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── BatchImportSection ────────────────────────────────────────────────────────
const CITY_ALIASES: Record<string, string> = {
  'Palo Alto/ San Francisco': 'Palo Alto',
  'Palo Alto/San Francisco': 'Palo Alto',
  'SF': 'San Francisco',
  'NYC': 'New York',
  'LA': 'Los Angeles',
  'DC': 'Washington DC',
}

function parseTabDate(raw: string): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  // Handle "7.1.26", "9.1.26" style
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (dotMatch) {
    const [, m, d, y] = dotMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // ISO or similar
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parsePastedRows(raw: string): ImportProfile[] {
  const lines = raw.trim().split('\n').filter(l => l.trim())
  const profiles: ImportProfile[] = []

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim())
    // Skip header row
    if (cols[0].toLowerCase() === 'name' || cols[0] === '') continue

    const name = cols[0]
    if (!name) continue

    const stops = []
    for (let s = 0; s < 3; s++) {
      const base = 1 + s * 3
      const rawCity = cols[base] ?? ''
      const city = (CITY_ALIASES[rawCity] ?? rawCity).trim()
      if (!city) continue
      stops.push({
        city,
        start_date: parseTabDate(cols[base + 1] ?? ''),
        end_date: parseTabDate(cols[base + 2] ?? ''),
      })
    }

    profiles.push({ name, stops })
  }

  return profiles
}

function BatchImportSection({ onSuccess }: { onSuccess: () => void }) {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ImportProfile[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [parseError, setParseError] = useState('')

  function handleParse() {
    setParseError('')
    if (!rawText.trim()) { setParseError('Paste some data first.'); return }
    const rows = parsePastedRows(rawText)
    if (rows.length === 0) { setParseError('No valid rows found. Make sure data is tab-separated (copy directly from Excel).'); return }
    setParsed(rows)
    setResults(null)
  }

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/import-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: parsed }),
      })
      const data = await res.json()
      setResults(data.results ?? [])
      onSuccess()
    } catch (e) {
      setParseError(String(e))
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setRawText('')
    setParsed(null)
    setResults(null)
    setParseError('')
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Upload size={14} /> Batch import from spreadsheet
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Copy rows directly from the Excel file (columns: Name, City 1, Start 1, End 1, City 2, Start 2, End 2, City 3, Start 3, End 3) and paste below.
            Claimed profiles are never modified. Existing unclaimed profiles get missing stops merged in.
          </p>
        </div>
      </div>

      {!results && (
        <>
          <textarea
            value={rawText}
            onChange={e => { setRawText(e.target.value); setParsed(null) }}
            placeholder={"Alex Wurm\tSeattle\t2026-06-07\t2026-09-08\nJohn Smith\tNew York\t2026-06-15\t2026-08-01\tSan Francisco\t2026-08-05\t2026-09-05"}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          {parseError && <p className="text-xs text-destructive">{parseError}</p>}

          {!parsed ? (
            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              Preview import
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">{parsed.length} rows parsed — review before importing:</p>
              <div className="rounded-xl border border-border overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {['Name', 'Stop 1', 'Stop 2', 'Stop 3'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.map((p, i) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        {[0, 1, 2].map(si => (
                          <td key={si} className="px-3 py-2 text-muted-foreground">
                            {p.stops[si] ? (
                              <span>
                                {p.stops[si].city}
                                {p.stops[si].start_date ? <span className="text-muted-foreground/70"> · {p.stops[si].start_date?.slice(5)}</span> : ''}
                              </span>
                            ) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
                >
                  <Check size={14} /> {importing ? 'Importing…' : `Import ${parsed.length} profiles`}
                </button>
                <button onClick={() => setParsed(null)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-accent transition">
                  Re-paste
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {results.filter(r => r.action === 'created').length} created
            </span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {results.filter(r => r.action === 'merged').length} merged
            </span>
            <span className="text-muted-foreground">
              {results.filter(r => r.action === 'skipped_claimed').length} skipped (claimed)
            </span>
            {results.filter(r => r.action === 'error').length > 0 && (
              <span className="text-destructive font-medium">
                {results.filter(r => r.action === 'error').length} errors
              </span>
            )}
          </div>

          <div className="rounded-xl border border-border overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {['Name', 'Action', 'Details'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.action === 'created' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        r.action === 'merged' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        r.action === 'skipped_claimed' ? 'bg-muted text-muted-foreground' :
                        'bg-destructive/10 text-destructive'
                      }`}>
                        {r.action === 'skipped_claimed' ? 'claimed' : r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.locationsAdded.length > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{r.locationsAdded.join(', ')} </span>}
                      {r.locationsSkipped.length > 0 && <span className="text-muted-foreground/70">skipped: {r.locationsSkipped.join(', ')}</span>}
                      {r.error && <span className="text-destructive">{r.error}</span>}
                      {r.action === 'skipped_claimed' && <span>profile owned by user</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={reset} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-accent transition">
            Import more
          </button>
        </div>
      )}
    </div>
  )
}

// ── AdminClient ───────────────────────────────────────────────────────────────
export function AdminClient({ profiles, treks, isSuperAdmin }: Props) {
  const [tab, setTab] = useState<'classmates' | 'treks' | 'insights' | 'profiles'>('classmates')
  const [insightsTab, setInsightsTab] = useState<'destinations' | 'heatmap' | 'completeness'>('destinations')
  const [destinationsView, setDestinationsView] = useState<'table' | 'timeline'>('table')
  const [search, setSearch] = useState('')
  const [completenessSort, setCompletenessSort] = useState<'asc' | 'desc' | 'alpha'>('asc')
  const [heatmapCitySort, setHeatmapCitySort] = useState<'count' | 'alpha'>('count')
  const router = useRouter()
  const supabase = createClient()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Profiles tab state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)

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

  const destinationTimeline = useMemo(() => {
    const weeks = getSummerWeeks()
    return trekInsights.slice(0, 12).map(insight => {
      const weeklyData = weeks.map(week => {
        let count = 0
        profiles.forEach(p => {
          (p.travel_interests ?? []).forEach(t => {
            if (t.destination_city !== insight.city || t.destination_country !== insight.country) return
            const intStart = t.interest_start_date ? new Date(t.interest_start_date) : SUMMER_START
            const intEnd   = t.interest_end_date   ? new Date(t.interest_end_date)   : SUMMER_END
            if (intStart <= week.end && intEnd >= week.start) count++
          })
        })
        return count
      })
      const maxCount = Math.max(1, ...weeklyData)
      return { city: insight.city, country: insight.country, total: insight.classmates.length, weeklyData, maxCount }
    })
  }, [trekInsights, profiles])

  const weeks = getSummerWeeks()

  const topCities = useMemo(() => {
    const cityCount = new Map<string, number>()
    profiles.forEach(p =>
      p.locations?.forEach(l => cityCount.set(l.city, (cityCount.get(l.city) ?? 0) + 1))
    )
    const byCount = Array.from(cityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city]) => city)
    return heatmapCitySort === 'alpha' ? [...byCount].sort() : byCount
  }, [profiles, heatmapCitySort])

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

  const sortedCompleteness = useMemo(() => {
    if (completenessSort === 'desc') return [...completenessScores].reverse()
    if (completenessSort === 'alpha') return [...completenessScores].sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name))
    return completenessScores
  }, [completenessScores, completenessSort])

  const completenessStats = useMemo(() => {
    const total = completenessScores.length
    return {
      total,
      avgScore: Math.round(completenessScores.reduce((s, x) => s + x.score, 0) / Math.max(1, total)),
      withPhoto: completenessScores.filter(s => !!s.profile.photo_url).length,
      withLocations: completenessScores.filter(s => (s.profile.locations?.length ?? 0) > 0).length,
      withInterests: completenessScores.filter(s => (s.profile.travel_interests?.length ?? 0) > 0).length,
      withTags: completenessScores.filter(s => (s.profile.activity_tags?.length ?? 0) > 0).length,
    }
  }, [completenessScores])

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
          {(['classmates', ...(isSuperAdmin ? ['profiles'] : []), 'treks', 'insights'] as ('classmates' | 'profiles' | 'treks' | 'insights')[]).map(t => (
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

      {tab === 'profiles' && isSuperAdmin && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-muted-foreground max-w-xl">
              <span className="font-medium text-foreground">Pre-seed classmate profiles</span> — add a name + email and optionally their summer stops.
              When they sign in with that email their profile is automatically claimed.
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {!showBatchImport && (
                <button
                  onClick={() => setShowBatchImport(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-accent transition"
                >
                  <Upload size={14} /> Batch import
                </button>
              )}
              {!addingNew && (
                <button
                  onClick={() => setAddingNew(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                >
                  <Plus size={14} /> Add classmate
                </button>
              )}
            </div>
          </div>

          {showBatchImport && (
            <BatchImportSection
              onSuccess={() => { router.refresh() }}
            />
          )}
          {showBatchImport && (
            <button
              onClick={() => setShowBatchImport(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              ← Hide batch import
            </button>
          )}

          {addingNew && (
            <AddClassmateForm
              onSuccess={() => { setAddingNew(false); router.refresh() }}
              onCancel={() => setAddingNew(false)}
            />
          )}

          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Name', 'Email', 'Status', 'Stops'].map(h => (
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
                    <td className="px-4 py-3">
                      {p.locations?.length
                        ? <div className="space-y-0.5">
                            {p.locations.sort((a, b) => a.sort_order - b.sort_order).map(l => (
                              <div key={l.id} className="text-xs text-muted-foreground">
                                {l.city}{l.start_date ? ` · ${l.start_date.slice(5)}` : ''}
                              </div>
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

          {insightsTab === 'destinations' && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp size={14} />
                  <span>Top destinations by classmate interest — potential trek candidates</span>
                </div>
                <div className="flex gap-1 rounded-lg border border-border bg-card p-0.5 text-xs">
                  {(['table', 'timeline'] as const).map(v => (
                    <button key={v} onClick={() => setDestinationsView(v)}
                      className={`px-3 py-1 rounded-md capitalize font-medium transition ${destinationsView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                      {v === 'timeline' ? 'Interest timeline' : 'Table'}
                    </button>
                  ))}
                </div>
              </div>

              {trekInsights.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No travel interests submitted yet.</p>
              ) : destinationsView === 'table' ? (
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
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Each bar = # classmates interested in visiting that week (based on stated date preferences; no-date interests count all summer).
                  </p>
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <div className="flex bg-muted/50 border-b border-border">
                      <div className="w-40 shrink-0 px-4 py-2 text-xs font-medium text-muted-foreground">Destination</div>
                      <div className="flex-1 overflow-x-auto">
                        <div className="flex min-w-max">
                          {getSummerWeeks().map(w => (
                            <div key={w.index} className="w-10 text-center py-2 text-[10px] text-muted-foreground shrink-0" title={w.dateLabel}>
                              W{w.index + 1}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {destinationTimeline.map(dest => (
                      <div key={`${dest.city}|${dest.country}`} className="flex border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors">
                        <div className="w-40 shrink-0 px-4 py-3">
                          <p className="text-xs font-medium truncate">{dest.city}</p>
                          <p className="text-[10px] text-muted-foreground">{dest.total} interested</p>
                        </div>
                        <div className="flex-1 overflow-x-auto flex items-center py-2">
                          <div className="flex min-w-max gap-0.5">
                            {dest.weeklyData.map((count, wi) => (
                              <div
                                key={wi}
                                className="w-10 h-7 rounded flex items-center justify-center text-[10px] font-semibold shrink-0"
                                title={`Week ${wi + 1}: ${count} interested`}
                                style={count > 0 ? {
                                  backgroundColor: `rgba(${isDark ? '192,57,43' : '140,21,21'},${Math.max(isDark ? 0.2 : 0.12, count / dest.maxCount * 0.85)})`,
                                  color: count / dest.maxCount > (isDark ? 0.25 : 0.45) ? 'white' : (isDark ? '#F07070' : '#8C1515'),
                                } : { color: 'transparent' }}
                              >
                                {count > 0 ? count : '·'}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {insightsTab === 'heatmap' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <BarChart2 size={14} /> Classmates per city per week — top {topCities.length} cities
                </p>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground mr-1">Sort cities:</span>
                  {(['count', 'alpha'] as const).map(s => (
                    <button key={s} onClick={() => setHeatmapCitySort(s)}
                      className={`px-2.5 py-1 rounded-lg border transition ${heatmapCitySort === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                      {s === 'count' ? 'By count' : 'A–Z'}
                    </button>
                  ))}
                </div>
              </div>
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
                        <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {weekCityMatrix.map(row => {
                        const rowTotal = row.cities.reduce((s, c) => s + c.count, 0)
                        return (
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
                                      backgroundColor: `rgba(${isDark ? '192,57,43' : '140,21,21'},${Math.max(isDark ? 0.2 : 0.1, count / maxDensity * 0.82)})`,
                                      color: count / maxDensity > (isDark ? 0.25 : 0.45) ? 'white' : (isDark ? '#F07070' : '#8C1515'),
                                    }}
                                  >
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">·</span>
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-semibold text-muted-foreground">
                              {rowTotal > 0 ? rowTotal : '·'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {insightsTab === 'completeness' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Avg completeness', value: `${completenessStats.avgScore}%` },
                  { label: 'Have photo', value: `${completenessStats.withPhoto} / ${completenessStats.total}` },
                  { label: 'Have locations', value: `${completenessStats.withLocations} / ${completenessStats.total}` },
                  { label: 'Have interests', value: `${completenessStats.withInterests} / ${completenessStats.total}` },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                    <div className="text-lg font-bold">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                {([['asc', 'Score ↑'], ['desc', 'Score ↓'], ['alpha', 'Name A–Z']] as const).map(([val, lbl]) => (
                  <button key={val} onClick={() => setCompletenessSort(val)}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition ${completenessSort === val ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Name', 'Score', 'Missing'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedCompleteness.map(({ profile: p, score }) => (
                      <tr key={p.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/profile/${p.id}`} className="hover:text-primary transition-colors">{p.full_name}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
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
                            {!p.photo_url && <span className="px-1.5 py-0.5 rounded font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">no photo</span>}
                            {!(p.locations?.length) && <span className="px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">no locations</span>}
                            {!(p.travel_interests?.length) && <span className="px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">no interests</span>}
                            {!p.section && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">no hometown</span>}
                            {!(p.activity_tags?.length) && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">no tags</span>}
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

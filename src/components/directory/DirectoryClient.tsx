'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Fuse from 'fuse.js'
import { Profile, Location, TravelInterest } from '@/lib/types'
import { avatarColor, getInitials, formatDateRange, getSummerWeeks, getLocationAtWeek, getMatchScore } from '@/lib/utils'
import { Search, MapPin, SlidersHorizontal, X, Sparkles, ArrowUpDown } from 'lucide-react'
// (Sparkles still used on the sort toggle button)

// Harvey-ball donut: score 0–100, colored by threshold
function MatchBall({ score }: { score: number }) {
  const r = 7, size = 18, cx = 9, cy = 9
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = score >= 70 ? '#16a34a' : score >= 45 ? '#ca8a04' : '#ea580c'
  const label = score >= 70 ? 'Strong' : score >= 45 ? 'Good' : 'Some'
  return (
    <span className="flex items-center gap-1 shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2.5}
          strokeDasharray={`${fill} ${circ - fill}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </span>
  )
}

type FullProfile = Profile & { locations: Location[]; travel_interests: TravelInterest[] }

interface Props {
  profiles: FullProfile[]
  myProfileId: string | null
  myProfile: FullProfile | null
}

export function DirectoryClient({ profiles, myProfileId, myProfile }: Props) {
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('')
  const [weekFilter, setWeekFilter] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'match' | 'alpha'>('match')
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())

  const weeks = getSummerWeeks()

  const allCities = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach(p => p.locations?.forEach(l => set.add(l.city)))
    return Array.from(set).sort()
  }, [profiles])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach(p => (p.activity_tags ?? []).forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [profiles])

  const fuse = useMemo(() => new Fuse(profiles, {
    keys: ['full_name', 'section', 'additional_details'],
    threshold: 0.35,
  }), [profiles])

  // Pre-compute match scores for all profiles (excluding self)
  const matchScores = useMemo(() => {
    if (!myProfile) return new Map<string, { score: number; reasons: string[] }>()
    const map = new Map<string, { score: number; reasons: string[] }>()
    for (const p of profiles) {
      if (p.id === myProfile.id) continue
      map.set(p.id, getMatchScore(myProfile, p))
    }
    return map
  }, [myProfile, profiles])

  const filtered = useMemo(() => {
    let results = search
      ? fuse.search(search).map(r => r.item)
      : [...profiles]

    if (cityFilter) {
      results = results.filter(p =>
        p.locations?.some(l => l.city.toLowerCase() === cityFilter.toLowerCase())
      )
    }

    if (weekFilter !== null) {
      results = results.filter(p => {
        const loc = getLocationAtWeek(p.locations ?? [], weekFilter)
        if (!loc) return false
        if (cityFilter) return loc.city.toLowerCase() === cityFilter.toLowerCase()
        return true
      })
    }

    if (tagFilters.size > 0) {
      results = results.filter(p =>
        (p.activity_tags ?? []).some(t => tagFilters.has(t))
      )
    }

    // Sort
    if (sortBy === 'match' && myProfile) {
      results = results.slice().sort((a, b) => {
        if (a.id === myProfile.id) return -1
        if (b.id === myProfile.id) return 1
        const sa = matchScores.get(a.id)?.score ?? 0
        const sb = matchScores.get(b.id)?.score ?? 0
        return sb - sa
      })
    } else {
      results = results.slice().sort((a, b) => a.full_name.localeCompare(b.full_name))
    }

    return results
  }, [search, cityFilter, weekFilter, tagFilters, sortBy, fuse, profiles, myProfile, matchScores])

  function clearFilters() {
    setSearch('')
    setCityFilter('')
    setWeekFilter(null)
    setTagFilters(new Set())
  }

  function toggleTag(tag: string) {
    setTagFilters(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const hasFilters = search || cityFilter || weekFilter !== null || tagFilters.size > 0

  return (
    <div className="space-y-5">
      {/* Primary filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search classmates…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={cityFilter}
          onChange={e => setCityFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All cities</option>
          {allCities.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={weekFilter ?? ''}
          onChange={e => setWeekFilter(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All weeks</option>
          {weeks.map(w => (
            <option key={w.index} value={w.index}>{w.label} ({w.dateLabel})</option>
          ))}
        </select>

        {/* Sort toggle */}
        <button
          onClick={() => setSortBy(s => s === 'match' ? 'alpha' : 'match')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition ${
            sortBy === 'match'
              ? 'border-primary/50 bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={sortBy === 'match' ? 'Sorted by best match — click for A–Z' : 'Sorted A–Z — click for best match'}
        >
          {sortBy === 'match' ? <Sparkles size={13} /> : <ArrowUpDown size={13} />}
          {sortBy === 'match' ? 'Best match' : 'A–Z'}
        </button>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Activity tag pills */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                tagFilters.has(tag)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {profiles.length} classmates
        {myProfile && sortBy === 'match' && ' · sorted by match'}
      </p>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(profile => {
          const locations = (profile.locations ?? []).sort((a, b) => a.sort_order - b.sort_order)
          const weekLocation = weekFilter !== null ? getLocationAtWeek(locations, weekFilter) : null
          const displayLocation = weekLocation ?? locations[0]
          const match = myProfile && profile.id !== myProfileId ? matchScores.get(profile.id) : null

          return (
            <Link
              key={profile.id}
              href={`/profile/${profile.id}`}
              className="group rounded-2xl border border-border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`relative w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(profile.full_name)}`}>
                  {profile.photo_url
                    ? <Image src={profile.photo_url} alt={profile.full_name} fill className="object-cover" unoptimized />
                    : getInitials(profile.full_name)
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                      {profile.full_name}
                      {profile.id === myProfileId && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
                    </p>
                    {match && match.score > 0 && <MatchBall score={match.score} />}
                  </div>
                  {profile.section && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.section}</p>
                  )}
                  <div className="flex gap-1 mt-1">
                    {profile.can_host && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700">
                        🏠 Host
                      </span>
                    )}
                    {profile.open_to_visit && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-700">
                        ✈️ Visitor
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Location summary */}
              {locations.length > 0 ? (
                <div className="space-y-1.5">
                  {(weekFilter !== null && displayLocation ? [displayLocation] : locations.slice(0, 2)).map(loc => (
                    <div key={loc.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin size={10} className="shrink-0 text-primary/60" />
                      <span className="truncate">
                        {loc.city}
                        {loc.country !== 'United States' ? `, ${loc.country}` : ''}
                        {loc.label ? ` · ${loc.label}` : ''}
                        {loc.so_name ? ` · w/ ${loc.so_name}` : ''}
                        {' · '}
                        {formatDateRange(loc.start_date, loc.end_date)}
                      </span>
                    </div>
                  ))}
                  {!weekFilter && locations.length > 2 && (
                    <p className="text-xs text-muted-foreground pl-4">+{locations.length - 2} more</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No locations added yet</p>
              )}

              {/* Match reasons */}
              {match && match.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {match.reasons.slice(0, 2).map((r, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20">
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Interest tags (only when no match reasons) */}
              {(!match || match.reasons.length === 0) && profile.travel_interests?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {profile.travel_interests.slice(0, 3).map(t => (
                    <span key={t.id} className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                      {t.destination_city}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <SlidersHorizontal size={24} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No classmates match your filters.</p>
        </div>
      )}
    </div>
  )
}

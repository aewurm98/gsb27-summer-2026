'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Fuse from 'fuse.js'
import { Profile, Location, TravelInterest } from '@/lib/types'
import { avatarColor, getInitials, formatDateRange, getSummerWeeks, getLocationAtWeek } from '@/lib/utils'
import { Search, MapPin, Briefcase, SlidersHorizontal, X } from 'lucide-react'

type FullProfile = Profile & { locations: Location[]; travel_interests: TravelInterest[] }

interface Props {
  profiles: FullProfile[]
  myProfileId: string | null
}

export function DirectoryClient({ profiles, myProfileId }: Props) {
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('')
  const [weekFilter, setWeekFilter] = useState<number | null>(null)

  const weeks = getSummerWeeks()

  const allCities = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach(p => p.locations?.forEach(l => set.add(l.city)))
    return Array.from(set).sort()
  }, [profiles])

  const fuse = useMemo(() => new Fuse(profiles, {
    keys: ['full_name', 'pre_mba_company', 'pre_mba_role', 'section'],
    threshold: 0.35,
  }), [profiles])

  const filtered = useMemo(() => {
    let results = search
      ? fuse.search(search).map(r => r.item)
      : profiles

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

    return results
  }, [search, cityFilter, weekFilter, fuse, profiles])

  function clearFilters() {
    setSearch('')
    setCityFilter('')
    setWeekFilter(null)
  }

  const hasFilters = search || cityFilter || weekFilter !== null

  return (
    <div className="space-y-6">
      {/* Filters */}
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

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {profiles.length} classmates
      </p>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(profile => {
          const locations = (profile.locations ?? []).sort((a, b) => a.sort_order - b.sort_order)
          const weekLocation = weekFilter !== null ? getLocationAtWeek(locations, weekFilter) : null
          const displayLocation = weekLocation ?? locations[0]

          return (
            <Link
              key={profile.id}
              href={`/profile/${profile.id}`}
              className="group rounded-2xl border border-border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(profile.full_name)}`}>
                  {profile.photo_url
                    ? <img src={profile.photo_url} alt={profile.full_name} className="w-full h-full object-cover" />
                    : getInitials(profile.full_name)
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                    {profile.full_name}
                    {profile.id === myProfileId && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
                  </p>
                  {(profile.pre_mba_role || profile.pre_mba_company) && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                      <Briefcase size={10} />
                      {[profile.pre_mba_role, profile.pre_mba_company].filter(Boolean).join(' @ ')}
                    </p>
                  )}
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
                        {' · '}
                        {formatDateRange(loc.start_date, loc.end_date)}
                      </span>
                    </div>
                  ))}
                  {!weekFilter && locations.length > 2 && (
                    <p className="text-xs text-muted-foreground pl-4">+{locations.length - 2} more stops</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No locations added yet</p>
              )}

              {/* Interest tags */}
              {profile.travel_interests?.length > 0 && (
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

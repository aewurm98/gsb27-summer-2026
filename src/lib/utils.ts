import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addWeeks, isWithinInterval, parseISO, format } from 'date-fns'
import { Location, Profile, TravelInterest, SUMMER_START, SUMMER_WEEKS } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSummerWeeks() {
  return Array.from({ length: SUMMER_WEEKS }, (_, i) => {
    const weekStart = addWeeks(SUMMER_START, i)
    const weekEnd = addWeeks(SUMMER_START, i + 1)
    return {
      index: i,
      label: `Week ${i + 1}`,
      start: weekStart,
      end: weekEnd,
      dateLabel: format(weekStart, 'MMM d'),
    }
  })
}

export function getLocationAtWeek(locations: Location[], weekIndex: number): Location | null {
  const weeks = getSummerWeeks()
  const week = weeks[weekIndex]
  if (!week) return null

  const SUMMER_END = addWeeks(SUMMER_START, SUMMER_WEEKS)
  // Sort by sort_order so adjacent-stop fallbacks are correct
  const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order)

  for (let i = 0; i < sorted.length; i++) {
    const loc = sorted[i]
    // Fill null start from previous stop's end, or summer start
    const start = loc.start_date
      ? parseISO(loc.start_date)
      : (sorted[i - 1]?.end_date ? parseISO(sorted[i - 1].end_date!) : SUMMER_START)
    // Fill null end from next stop's start, or summer end
    const end = loc.end_date
      ? parseISO(loc.end_date)
      : (sorted[i + 1]?.start_date ? parseISO(sorted[i + 1].start_date!) : SUMMER_END)

    if (isWithinInterval(week.start, { start, end }) || isWithinInterval(week.end, { start, end }) ||
        (start <= week.start && end >= week.end)) {
      return loc
    }
  }
  return null
}

export function getOverlappingClassmates(
  myLocations: Location[],
  allProfiles: Array<{ id: string; full_name: string; locations: Location[] }>,
  weekIndex?: number
): Array<{ profileId: string; name: string; city: string; weeks: number[] }> {
  const overlaps: Map<string, { profileId: string; name: string; city: string; weeks: number[] }> = new Map()

  const weeksToCheck = weekIndex !== undefined ? [weekIndex] : Array.from({ length: SUMMER_WEEKS }, (_, i) => i)

  for (const week of weeksToCheck) {
    const myLoc = getLocationAtWeek(myLocations, week)
    if (!myLoc) continue

    for (const profile of allProfiles) {
      const theirLoc = getLocationAtWeek(profile.locations, week)
      if (!theirLoc) continue

      if (myLoc.city.toLowerCase() === theirLoc.city.toLowerCase()) {
        const existing = overlaps.get(profile.id)
        if (existing) {
          existing.weeks.push(week)
        } else {
          overlaps.set(profile.id, {
            profileId: profile.id,
            name: profile.full_name,
            city: myLoc.city,
            weeks: [week],
          })
        }
      }
    }
  }

  return Array.from(overlaps.values())
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'Dates TBD'
  if (start && !end) return `${format(parseISO(start), 'MMM d')} – TBD`
  if (!start && end) return `TBD – ${format(parseISO(end), 'MMM d')}`
  return `${format(parseISO(start!), 'MMM d')} – ${format(parseISO(end!), 'MMM d')}`
}

// ─── Matching engine ─────────────────────────────────────────────────────────

export interface MatchResult {
  score: number      // 0–100
  reasons: string[]  // human-readable chips e.g. "3w overlap in Tokyo"
}

type MatchProfile = Pick<Profile, 'id' | 'activity_tags' | 'trip_style' | 'group_size_pref' | 'travel_budget' | 'travel_pace'> & {
  locations: Location[]
  travel_interests: TravelInterest[]
}

function getOverlappingWeeks(
  myLocs: Location[],
  theirLocs: Location[]
): Array<{ weekIndex: number; city: string }> {
  const overlaps: Array<{ weekIndex: number; city: string }> = []
  for (let i = 0; i < SUMMER_WEEKS; i++) {
    const mine = getLocationAtWeek(myLocs, i)
    const theirs = getLocationAtWeek(theirLocs, i)
    if (mine && theirs && mine.city.toLowerCase() === theirs.city.toLowerCase()) {
      overlaps.push({ weekIndex: i, city: mine.city })
    }
  }
  return overlaps
}

export function getMatchScore(me: MatchProfile, them: MatchProfile): MatchResult {
  let score = 0
  const reasons: string[] = []

  // 1. Co-location overlap — up to 40 pts (+5/week, capped)
  const overlaps = getOverlappingWeeks(me.locations, them.locations)
  if (overlaps.length > 0) {
    score += Math.min(40, overlaps.length * 5)
    // Count by city to surface the most-shared
    const cityCounts = new Map<string, number>()
    overlaps.forEach(o => cityCounts.set(o.city, (cityCounts.get(o.city) ?? 0) + 1))
    const topCity = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    reasons.push(`${overlaps.length}w overlap in ${topCity[0]}`)
  }

  // 2. Shared travel interests — up to 30 pts (+10/shared destination)
  const myInterestCities = new Set(me.travel_interests.map(t => t.destination_city.toLowerCase()))
  const shared = them.travel_interests.filter(t => myInterestCities.has(t.destination_city.toLowerCase()))
  if (shared.length > 0) {
    score += Math.min(30, shared.length * 10)
    const names = shared.slice(0, 2).map(t => t.destination_city).join(', ')
    reasons.push(`Both want to visit ${names}${shared.length > 2 ? ` +${shared.length - 2}` : ''}`)
  }

  // 3. Shared activity tags — up to 20 pts (+4/shared tag)
  const myTags = new Set(me.activity_tags ?? [])
  const sharedTags = (them.activity_tags ?? []).filter(t => myTags.has(t))
  if (sharedTags.length > 0) {
    score += Math.min(20, sharedTags.length * 4)
    reasons.push(`Both into ${sharedTags.slice(0, 3).join(', ')}`)
  }

  // 4. Preference matches — up to 15 pts
  // Trip vibe match (5 pts)
  if (me.trip_style && them.trip_style && me.trip_style === them.trip_style) {
    score += 5
    const label = me.trip_style === 'nightlife' ? 'social & nightlife' : me.trip_style
    reasons.push(`Same vibe (${label})`)
  }
  // Budget match (5 pts)
  if (me.travel_budget && them.travel_budget && me.travel_budget === them.travel_budget) {
    score += 5
    reasons.push(`Same budget style`)
  }
  // Pace match (5 pts)
  if (me.travel_pace && them.travel_pace && me.travel_pace === them.travel_pace) {
    score += 5
    const paceLabel = me.travel_pace === 'fast-paced' ? 'fast-paced' : me.travel_pace === 'slow-immersive' ? 'slow & deep' : 'balanced pace'
    reasons.push(`Same pace (${paceLabel})`)
  }

  return { score: Math.min(100, score), reasons }
}

// ─────────────────────────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function avatarColor(name: string): string {
  const colors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

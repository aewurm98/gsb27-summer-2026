import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addWeeks, isWithinInterval, parseISO, format, startOfWeek, endOfWeek } from 'date-fns'
import { Location, SUMMER_START, SUMMER_WEEKS } from './types'

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

  for (const loc of locations) {
    const start = loc.start_date ? parseISO(loc.start_date) : SUMMER_START
    const end = loc.end_date ? parseISO(loc.end_date) : addWeeks(SUMMER_START, SUMMER_WEEKS)

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
  if (start && !end) return `${format(parseISO(start), 'MMM d')} – ?`
  if (!start && end) return `? – ${format(parseISO(end), 'MMM d')}`
  return `${format(parseISO(start!), 'MMM d')} – ${format(parseISO(end!), 'MMM d')}`
}

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

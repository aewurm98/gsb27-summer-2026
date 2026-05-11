'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Profile, Location, SUMMER_WEEKS } from '@/lib/types'
import { getSummerWeeks, getLocationAtWeek, avatarColor, getInitials } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Play, Pause, Users } from 'lucide-react'
import Link from 'next/link'

type MapProfile = Pick<Profile, 'id' | 'full_name' | 'photo_url' | 'pre_mba_company' | 'pre_mba_role'> & {
  locations: Location[]
}

interface CityGroup {
  city: string
  lat: number
  lng: number
  profiles: MapProfile[]
}

export function MapClient({ profiles }: { profiles: MapProfile[] }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const popupRef = useRef<mapboxgl.Popup | null>(null)

  const [weekIndex, setWeekIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedCity, setSelectedCity] = useState<CityGroup | null>(null)
  const weeks = getSummerWeeks()

  // Group profiles by city for the current week
  const cityGroups = useMemo((): CityGroup[] => {
    const map = new Map<string, CityGroup>()
    profiles.forEach(profile => {
      const loc = getLocationAtWeek(profile.locations ?? [], weekIndex)
      if (!loc) return
      const key = `${loc.city}|${loc.lat}|${loc.lng}`
      if (!map.has(key)) {
        map.set(key, { city: loc.city, lat: loc.lat, lng: loc.lng, profiles: [] })
      }
      map.get(key)!.profiles.push(profile)
    })
    return Array.from(map.values())
  }, [profiles, weekIndex])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-100, 40],
      zoom: 3.5,
      attributionControl: false,
    })

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
  }, [])

  // Update markers when week or data changes
  useEffect(() => {
    if (!map.current) return

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    cityGroups.forEach(group => {
      const el = document.createElement('div')
      el.className = 'map-marker'
      el.style.cssText = `
        width: ${Math.max(36, 24 + group.profiles.length * 6)}px;
        height: ${Math.max(36, 24 + group.profiles.length * 6)}px;
        border-radius: 50%;
        background: var(--primary, #5046e5);
        border: 3px solid white;
        box-shadow: 0 2px 12px rgba(80,70,229,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        transition: transform 0.2s;
      `
      el.innerHTML = group.profiles.length === 1 ? getInitials(group.profiles[0].full_name) : String(group.profiles.length)
      el.onmouseenter = () => { el.style.transform = 'scale(1.15)' }
      el.onmouseleave = () => { el.style.transform = 'scale(1)' }
      el.onclick = () => setSelectedCity(group)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([group.lng, group.lat])
        .addTo(map.current!)

      markersRef.current.push(marker)
    })
  }, [cityGroups])

  // Auto-play
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      setWeekIndex(i => {
        if (i >= SUMMER_WEEKS - 1) { setPlaying(false); return i }
        return i + 1
      })
    }, 800)
    return () => clearInterval(interval)
  }, [playing])

  const activeCount = cityGroups.reduce((s, g) => s + g.profiles.length, 0)

  return (
    <div className="relative flex-1 flex">
      {/* Map */}
      <div ref={mapContainer} className="flex-1" />

      {/* Week slider panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">{weeks[weekIndex].label}</p>
              <p className="text-xs text-muted-foreground">
                {weeks[weekIndex].dateLabel} · {activeCount} classmate{activeCount !== 1 ? 's' : ''} tracked
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekIndex(i => Math.max(0, i - 1))}
                disabled={weekIndex === 0}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPlaying(p => !p)}
                className="p-1.5 rounded-lg hover:bg-accent transition"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={() => setWeekIndex(i => Math.min(SUMMER_WEEKS - 1, i + 1))}
                disabled={weekIndex === SUMMER_WEEKS - 1}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={SUMMER_WEEKS - 1}
            value={weekIndex}
            onChange={e => setWeekIndex(Number(e.target.value))}
            className="w-full accent-primary"
          />

          {/* Week labels */}
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">Jun 1</span>
            <span className="text-xs text-muted-foreground">Sep 14</span>
          </div>
        </div>
      </div>

      {/* City popup panel */}
      {selectedCity && (
        <div className="absolute top-4 right-4 w-72 rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{selectedCity.city}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Users size={10} />
                {selectedCity.profiles.length} classmate{selectedCity.profiles.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setSelectedCity(null)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {selectedCity.profiles.map(profile => (
              <Link
                key={profile.id}
                href={`/profile/${profile.id}`}
                className="flex items-center gap-3 p-3 hover:bg-accent transition-colors"
              >
                <div className={`relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(profile.full_name)}`}>
                  {profile.photo_url
                    ? <Image src={profile.photo_url} alt={profile.full_name} fill className="object-cover" unoptimized />
                    : getInitials(profile.full_name)
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{profile.full_name}</p>
                  {profile.pre_mba_company && (
                    <p className="text-xs text-muted-foreground truncate">{profile.pre_mba_company}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 left-4 rounded-xl border border-border bg-card/90 backdrop-blur-sm px-3 py-2 text-xs text-muted-foreground">
        Click a marker to see classmates · Drag to explore
      </div>
    </div>
  )
}

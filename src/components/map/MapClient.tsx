'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Profile, Location, SUMMER_WEEKS } from '@/lib/types'
import { getSummerWeeks, getLocationAtWeek, avatarColor, getInitials } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Play, Pause, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useMapStore } from '@/lib/map-store'

type MapProfile = Pick<Profile, 'id' | 'full_name' | 'photo_url'> & {
  locations: Location[]
}

interface CityGroup {
  city: string
  lat: number
  lng: number
  profiles: Array<MapProfile & { currentExperience?: { label: string | null; company: string | null; role: string | null; neighborhood: string | null } }>
}

interface OffScreenIndicator extends CityGroup {
  screenX: number
  screenY: number
  angleDeg: number
}

/** Compute where the ray from (cx,cy) toward (px,py) intersects the padded map rectangle */
function getEdgePoint(
  cx: number, cy: number,
  px: number, py: number,
  w: number, h: number,
  pad: number
): { x: number; y: number } {
  const dx = px - cx, dy = py - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  let t = Infinity
  const l = pad, r = w - pad, top = pad, bot = h - pad
  if (dx > 0) t = Math.min(t, (r - cx) / dx)
  if (dx < 0) t = Math.min(t, (l - cx) / dx)
  if (dy > 0) t = Math.min(t, (bot - cy) / dy)
  if (dy < 0) t = Math.min(t, (top - cy) / dy)
  return {
    x: Math.max(l, Math.min(r, cx + t * dx)),
    y: Math.max(top, Math.min(bot, cy + t * dy)),
  }
}

export function MapClient({ profiles }: { profiles: MapProfile[] }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const { weekIndex, setWeekIndex } = useMapStore()
  const [playing, setPlaying] = useState(false)
  const [selectedCity, setSelectedCity] = useState<CityGroup | null>(null)
  const [showWeekPicker, setShowWeekPicker] = useState(false)
  const weeks = getSummerWeeks()

  // Off-screen indicator state
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 })
  const [mapBounds, setMapBounds] = useState<mapboxgl.LngLatBounds | null>(null)
  const [offScreen, setOffScreen] = useState<OffScreenIndicator[]>([])

  // Group all profiles by city name (case-insensitive) for the current week
  // Key on city only — not lat/lng — so seed vs. user-entered coords don't split a city
  const cityGroups = useMemo((): CityGroup[] => {
    const cityMap = new Map<string, CityGroup>()
    profiles.forEach(profile => {
      const loc = getLocationAtWeek(profile.locations ?? [], weekIndex)
      if (!loc) return
      const key = loc.city.toLowerCase()
      if (!cityMap.has(key)) {
        cityMap.set(key, { city: loc.city, lat: loc.lat, lng: loc.lng, profiles: [] })
      }
      cityMap.get(key)!.profiles.push({
        ...profile,
        currentExperience: {
          label: loc.label,
          company: loc.company,
          role: loc.role,
          neighborhood: (loc as Location & { neighborhood?: string }).neighborhood ?? null,
        },
      })
    })
    return Array.from(cityMap.values())
  }, [profiles, weekIndex])

  // ── Map initialisation ──────────────────────────────────────────────────────
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
    map.current.on('load', () => setMapLoaded(true))
  }, [])

  // ── Track viewport for off-screen indicators ────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const update = () => {
      if (!map.current || !mapContainer.current) return
      setMapBounds(map.current.getBounds() ?? null)
      setMapSize({ w: mapContainer.current.offsetWidth, h: mapContainer.current.offsetHeight })
    }
    update()
    map.current.on('moveend', update)
    map.current.on('zoomend', update)
    return () => {
      map.current?.off('moveend', update)
      map.current?.off('zoomend', update)
    }
  }, [mapLoaded])

  // ── Compute off-screen edge indicators ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapBounds || mapSize.w === 0) { setOffScreen([]); return }
    const PAD = 52
    const cx = mapSize.w / 2, cy = mapSize.h / 2
    const indicators: OffScreenIndicator[] = []

    for (const group of cityGroups) {
      try {
        if (mapBounds.contains([group.lng, group.lat])) continue
        const proj = map.current.project([group.lng, group.lat])
        const { x, y } = getEdgePoint(cx, cy, proj.x, proj.y, mapSize.w, mapSize.h, PAD)
        const angleDeg = Math.atan2(proj.y - cy, proj.x - cx) * (180 / Math.PI)
        indicators.push({ ...group, screenX: x, screenY: y, angleDeg })
      } catch { /* skip if projection fails during map init */ }
    }

    indicators.sort((a, b) => b.profiles.length - a.profiles.length)
    setOffScreen(indicators.slice(0, 8))
  }, [cityGroups, mapBounds, mapSize])

  // ── Render markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    cityGroups.forEach(group => {
      const count = group.profiles.length
      const size = Math.max(36, 28 + count * 4)

      const el = document.createElement('div')
      el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;`

      const inner = document.createElement('div')
      inner.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;
        background:var(--primary,#8C1515);border:3px solid white;
        box-shadow:0 2px 12px rgba(140,21,21,0.4);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:700;font-size:${count > 9 ? 11 : 12}px;
        transition:transform 0.15s ease,box-shadow 0.15s ease;
      `
      inner.textContent = count === 1 ? getInitials(group.profiles[0].full_name) : String(count)
      el.appendChild(inner)

      el.onmouseenter = () => { inner.style.transform = 'scale(1.2)'; inner.style.boxShadow = '0 4px 18px rgba(140,21,21,0.55)' }
      el.onmouseleave = () => { inner.style.transform = 'scale(1)'; inner.style.boxShadow = '0 2px 12px rgba(140,21,21,0.4)' }
      el.onclick = () => setSelectedCity(group)

      markersRef.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([group.lng, group.lat]).addTo(map.current!)
      )
    })
  }, [cityGroups])

  // ── Playback ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      if (weekIndex >= SUMMER_WEEKS - 1) setPlaying(false)
      else setWeekIndex(weekIndex + 1)
    }, 800)
    return () => clearInterval(interval)
  }, [playing, weekIndex, setWeekIndex])

  const activeCount = cityGroups.reduce((s, g) => s + g.profiles.length, 0)

  return (
    <div className="relative flex-1 flex">
      <div ref={mapContainer} className="flex-1" />

      {/* ── Off-screen edge indicators ─────────────────────────────────── */}
      {offScreen.map(ind => (
        <button
          key={ind.city}
          onClick={() => map.current?.flyTo({ center: [ind.lng, ind.lat], zoom: Math.max((map.current?.getZoom() ?? 3), 5), duration: 1400, essential: true })}
          style={{ position: 'absolute', left: ind.screenX, top: ind.screenY, transform: 'translate(-50%,-50%)' }}
          className="flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:scale-110 transition-transform z-20 pointer-events-auto"
          title={`Fly to ${ind.city}`}
        >
          <ArrowRight
            size={11}
            style={{ transform: `rotate(${ind.angleDeg}deg)`, flexShrink: 0 }}
          />
          <span className="max-w-[80px] truncate">{ind.city}</span>
          {ind.profiles.length > 1 && (
            <span className="bg-white/25 rounded-full px-1 tabular-nums">{ind.profiles.length}</span>
          )}
        </button>
      ))}

      {/* ── Week slider panel ──────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4">
        <div className="relative rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-lg p-4">
          {showWeekPicker && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl p-3 shadow-lg z-10">
              <div className="grid grid-cols-4 gap-1">
                {weeks.map((week, i) => (
                  <button
                    key={i}
                    onClick={() => { setWeekIndex(i); setShowWeekPicker(false) }}
                    className={`px-2 py-1.5 rounded-lg text-xs text-left transition ${
                      i === weekIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
                    }`}
                  >
                    <div className="font-medium">W{i + 1}</div>
                    <div className="opacity-70">{week.dateLabel}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{weeks[weekIndex].label}</p>
                <button
                  onClick={() => setShowWeekPicker(p => !p)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Jump to week
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {weeks[weekIndex].dateLabel} · {activeCount} classmate{activeCount !== 1 ? 's' : ''} tracked
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekIndex(Math.max(0, weekIndex - 1))} disabled={weekIndex === 0}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPlaying(p => !p)} className="p-1.5 rounded-lg hover:bg-accent transition">
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => setWeekIndex(Math.min(SUMMER_WEEKS - 1, weekIndex + 1))} disabled={weekIndex === SUMMER_WEEKS - 1}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <input type="range" min={0} max={SUMMER_WEEKS - 1} value={weekIndex}
            onChange={e => setWeekIndex(Number(e.target.value))}
            className="w-full accent-primary" />

          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">Jun 1</span>
            <span className="text-xs text-muted-foreground">Sep 14</span>
          </div>
        </div>
      </div>

      {/* ── City detail popup ──────────────────────────────────────────── */}
      {selectedCity && (
        <div className="absolute top-4 right-4 w-72 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-10">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{selectedCity.city}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Users size={10} />
                {selectedCity.profiles.length} classmate{selectedCity.profiles.length !== 1 ? 's' : ''} this week
              </p>
            </div>
            <button onClick={() => setSelectedCity(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {selectedCity.profiles.map(profile => (
              <Link key={profile.id} href={`/profile/${profile.id}`}
                className="flex items-center gap-3 p-3 hover:bg-accent transition-colors">
                <div className={`relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(profile.full_name)}`}>
                  {profile.photo_url
                    ? <Image src={profile.photo_url} alt={profile.full_name} fill className="object-cover" unoptimized />
                    : getInitials(profile.full_name)
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile.currentExperience?.neighborhood
                      ? profile.currentExperience.neighborhood
                      : [profile.currentExperience?.role, profile.currentExperience?.company].filter(Boolean).join(' @ ')
                        || profile.currentExperience?.label
                        || ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 rounded-xl border border-border bg-card/90 backdrop-blur-sm px-3 py-2 text-xs text-muted-foreground">
        Click a marker to see classmates · Drag to explore
      </div>
    </div>
  )
}

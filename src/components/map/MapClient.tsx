'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Profile, Location, SUMMER_WEEKS } from '@/lib/types'
import { getSummerWeeks, getLocationAtWeek, avatarColor, avatarColorHex, getInitials } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Play, Pause, Users, ArrowRight, Maximize2, Home, Plane } from 'lucide-react'
import Link from 'next/link'
import { useMapStore } from '@/lib/map-store'

type MapProfile = Pick<Profile, 'id' | 'full_name' | 'photo_url' | 'can_host' | 'open_to_visit'> & {
  locations: Location[]
}

type ExperienceSnippet = {
  label: string | null
  company: string | null
  role: string | null
  neighborhood: string | null
}

const VISITOR_LABELS = new Set(['Traveling', 'Visiting family/friends'])

function isVisitorExperience(exp?: ExperienceSnippet): boolean {
  return exp?.label != null && VISITOR_LABELS.has(exp.label)
}

interface CityGroup {
  city: string
  lat: number
  lng: number
  profiles: Array<MapProfile & { currentExperience?: ExperienceSnippet }>
}

interface OffScreenIndicator extends CityGroup {
  screenX: number
  screenY: number
  angleDeg: number
}

interface HoverCard {
  profile: MapProfile & { currentExperience?: ExperienceSnippet }
  x: number   // px from left of map container
  y: number   // px from top of map container
  above: boolean
}

const INITIAL_CENTER: [number, number] = [-100, 40]
const INITIAL_ZOOM = 3.5
const SPLIT_ZOOM = 9

/** Ray from centre (cx,cy) toward (px,py) — where does it hit the padded rectangle? */
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

/** Spread overlapping edge pills so they don't pile up (forward + backward pass) */
function resolveIndicatorCollisions(
  indicators: OffScreenIndicator[],
  w: number, h: number, PAD: number
): OffScreenIndicator[] {
  const MIN_GAP = 92
  const classify = (ind: OffScreenIndicator): 'top' | 'bottom' | 'left' | 'right' => {
    const dT = Math.abs(ind.screenY - PAD)
    const dB = Math.abs(ind.screenY - (h - PAD))
    const dL = Math.abs(ind.screenX - PAD)
    const dR = Math.abs(ind.screenX - (w - PAD))
    const min = Math.min(dT, dB, dL, dR)
    if (min === dT) return 'top'
    if (min === dB) return 'bottom'
    if (min === dL) return 'left'
    return 'right'
  }
  const groups: Record<'top' | 'bottom' | 'left' | 'right', OffScreenIndicator[]> = {
    top: [], bottom: [], left: [], right: [],
  }
  indicators.forEach(ind => groups[classify(ind)].push(ind))

  function spread(
    items: OffScreenIndicator[], key: 'screenX' | 'screenY', lo: number, hi: number
  ): OffScreenIndicator[] {
    if (items.length <= 1) return items
    const s = [...items].sort((a, b) => a[key] - b[key])
    for (let i = 1; i < s.length; i++) {
      if (s[i][key] - s[i - 1][key] < MIN_GAP) s[i] = { ...s[i], [key]: s[i - 1][key] + MIN_GAP }
    }
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i][key] > hi) s[i] = { ...s[i], [key]: hi }
      if (i > 0 && s[i][key] - s[i - 1][key] < MIN_GAP)
        s[i - 1] = { ...s[i - 1], [key]: s[i][key] - MIN_GAP }
    }
    return s
  }

  return [
    ...spread(groups.top,    'screenX', PAD, w - PAD),
    ...spread(groups.bottom, 'screenX', PAD, w - PAD),
    ...spread(groups.left,   'screenY', PAD, h - PAD),
    ...spread(groups.right,  'screenY', PAD, h - PAD),
  ]
}

// ── Hover card (React overlay, not Mapbox popup) ─────────────────────────────
function ProfileHoverCard({
  card,
  onMouseEnter,
  onMouseLeave,
}: {
  card: HoverCard
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const exp = card.profile.currentExperience
  const expLine = exp?.neighborhood
    || [exp?.role, exp?.company].filter(Boolean).join(' @ ')
    || exp?.label
    || null

  return (
    <div
      style={{
        position: 'absolute',
        left: card.x,
        top: card.y,
        transform: card.above
          ? 'translate(-50%, calc(-100% - 14px))'
          : 'translate(-50%, 14px)',
        zIndex: 40,
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="w-56 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
    >
      {/* Arrow indicator */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 ${
          card.above ? 'bottom-0 translate-y-full' : 'top-0 -translate-y-full'
        }`}
        style={{
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          ...(card.above
            ? { borderTop: '7px solid hsl(var(--border))' }
            : { borderBottom: '7px solid hsl(var(--border))' }),
        }}
      />

      <div className="p-3.5">
        {/* Header row */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0 ${avatarColor(card.profile.full_name)}`}>
            {card.profile.photo_url
              ? <Image src={card.profile.photo_url} alt={card.profile.full_name} fill className="object-cover" unoptimized />
              : getInitials(card.profile.full_name)
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug truncate">{card.profile.full_name}</p>
            {(card.profile.can_host || card.profile.open_to_visit) && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {card.profile.can_host && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500 text-white">
                    <Home size={8} /> Host
                  </span>
                )}
                {card.profile.open_to_visit && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-sky-500 text-white">
                    <Plane size={8} /> Visitor
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Experience line */}
        {expLine && (
          <p className="text-xs text-muted-foreground mb-2.5 truncate">{expLine}</p>
        )}

        {/* CTA */}
        <Link
          href={`/profile/${card.profile.id}`}
          className="flex items-center justify-between w-full text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <span>View profile</span>
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function MapClient({ profiles }: { profiles: MapProfile[] }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { weekIndex, setWeekIndex } = useMapStore()
  const [playing, setPlaying] = useState(false)
  const [selectedCity, setSelectedCity] = useState<CityGroup | null>(null)
  const [showWeekPicker, setShowWeekPicker] = useState(false)
  const weeks = getSummerWeeks()

  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 })
  const [mapBounds, setMapBounds] = useState<mapboxgl.LngLatBounds | null>(null)
  const [offScreen, setOffScreen] = useState<OffScreenIndicator[]>([])
  const [zoomLevel, setZoomLevel] = useState(INITIAL_ZOOM)
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null)

  // Group profiles by city for the current week
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

  // ── Map init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.current.on('load', () => setMapLoaded(true))
  }, [])

  // ── Track viewport + zoom; dismiss hover card on pan/zoom ────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const update = () => {
      if (!map.current || !mapContainer.current) return
      setMapBounds(map.current.getBounds() ?? null)
      setMapSize({ w: mapContainer.current.offsetWidth, h: mapContainer.current.offsetHeight })
      setZoomLevel(map.current.getZoom())
    }
    const dismiss = () => setHoverCard(null)
    update()
    map.current.on('moveend', update)
    map.current.on('zoomend', update)
    map.current.on('movestart', dismiss)
    return () => {
      map.current?.off('moveend', update)
      map.current?.off('zoomend', update)
      map.current?.off('movestart', dismiss)
    }
  }, [mapLoaded])

  // ── Off-screen edge indicators ───────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapBounds || mapSize.w === 0) { setOffScreen([]); return }
    const PAD = 56
    const cx = mapSize.w / 2, cy = mapSize.h / 2
    const raw: OffScreenIndicator[] = []

    for (const group of cityGroups) {
      try {
        if (mapBounds.contains([group.lng, group.lat])) continue
        const proj = map.current.project([group.lng, group.lat])
        const { x, y } = getEdgePoint(cx, cy, proj.x, proj.y, mapSize.w, mapSize.h, PAD)
        const angleDeg = Math.atan2(proj.y - cy, proj.x - cx) * (180 / Math.PI)
        raw.push({ ...group, screenX: x, screenY: y, angleDeg })
      } catch { /* skip during init */ }
    }

    raw.sort((a, b) => b.profiles.length - a.profiles.length)
    setOffScreen(resolveIndicatorCollisions(raw.slice(0, 8), mapSize.w, mapSize.h, PAD))
  }, [cityGroups, mapBounds, mapSize])

  // ── Markers ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setHoverCard(null)

    const isSplit = zoomLevel >= SPLIT_ZOOM

    cityGroups.forEach(group => {
      if (isSplit) {
        // Individual avatar markers
        const n = group.profiles.length
        group.profiles.forEach((profile, idx) => {
          const angle = n === 1 ? -Math.PI / 2 : (idx / n) * 2 * Math.PI - Math.PI / 2
          const r = n === 1 ? 0 : Math.min(44, 16 + n * 3)
          const offset: [number, number] = [Math.cos(angle) * r, Math.sin(angle) * r]

          const el = document.createElement('div')
          el.style.cssText = `width:34px;height:34px;cursor:pointer;`

          const inner = document.createElement('div')
          inner.style.cssText = `
            width:34px;height:34px;border-radius:50%;
            background:${avatarColorHex(profile.full_name)};
            border:2.5px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.18);
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:700;font-size:11px;
            transition:transform 0.15s ease,box-shadow 0.15s ease;
          `
          inner.textContent = getInitials(profile.full_name)
          el.appendChild(inner)

          // Visitor badge overlay on individual avatars
          if (isVisitorExperience(profile.currentExperience)) {
            const badge = document.createElement('div')
            badge.style.cssText = `
              position:absolute;bottom:-2px;right:-2px;
              width:14px;height:14px;border-radius:50%;
              background:#0ea5e9;border:1.5px solid white;
              display:flex;align-items:center;justify-content:center;
              font-size:8px;pointer-events:none;
            `
            badge.textContent = '✈'
            el.style.position = 'relative'
            el.appendChild(badge)
          }

          el.onmouseenter = () => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
            inner.style.transform = 'scale(1.2)'
            inner.style.boxShadow = '0 4px 14px rgba(0,0,0,0.28)'
            if (!map.current || !mapContainer.current) return
            const proj = map.current.project([group.lng, group.lat])
            const x = proj.x + offset[0]
            const y = proj.y + offset[1]
            const above = y > 160
            setHoverCard({ profile, x, y, above })
          }
          el.onmouseleave = () => {
            inner.style.transform = 'scale(1)'
            inner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)'
            hoverTimeout.current = setTimeout(() => setHoverCard(null), 160)
          }
          el.onclick = () => { window.location.href = `/profile/${profile.id}` }

          markersRef.current.push(
            new mapboxgl.Marker({ element: el, offset })
              .setLngLat([group.lng, group.lat])
              .addTo(map.current!)
          )
        })
      } else {
        // Cluster count bubble — differentiate residents vs visitors
        const count = group.profiles.length
        const size = Math.max(36, 28 + count * 4)
        const residentCount = group.profiles.filter(p => !isVisitorExperience(p.currentExperience)).length
        const allVisitors = residentCount === 0
        // Visitor-only: sky blue; mixed/resident: Stanford red
        const bg = allVisitors ? '#0ea5e9' : 'var(--primary,#8C1515)'
        const shadow = allVisitors ? 'rgba(14,165,233,0.4)' : 'rgba(140,21,21,0.4)'
        const shadowHover = allVisitors ? 'rgba(14,165,233,0.6)' : 'rgba(140,21,21,0.55)'

        const el = document.createElement('div')
        el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;position:relative;`

        const inner = document.createElement('div')
        inner.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:${bg};border:3px solid white;
          box-shadow:0 2px 12px ${shadow};
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:700;font-size:${count > 9 ? 11 : 12}px;
          transition:transform 0.15s ease,box-shadow 0.15s ease;
        `
        // Visitor-only clusters get a ✈ prefix; mixed/resident clusters show count normally
        if (allVisitors) {
          inner.innerHTML = count === 1
            ? `<span style="font-size:14px">✈</span>`
            : `<span style="font-size:${count > 9 ? 9 : 10}px">✈${count}</span>`
        } else {
          inner.textContent = count === 1 ? getInitials(group.profiles[0].full_name) : String(count)
          // If mixed, add small visitor badge
          if (residentCount < count) {
            const badge = document.createElement('div')
            badge.style.cssText = `
              position:absolute;top:-4px;right:-4px;
              background:#0ea5e9;border:1.5px solid white;border-radius:50%;
              width:16px;height:16px;display:flex;align-items:center;justify-content:center;
              font-size:8px;color:white;font-weight:700;
            `
            badge.textContent = '✈'
            el.appendChild(badge)
          }
        }
        el.appendChild(inner)

        el.onmouseenter = () => {
          inner.style.transform = 'scale(1.2)'
          inner.style.boxShadow = `0 4px 18px ${shadowHover}`
        }
        el.onmouseleave = () => {
          inner.style.transform = 'scale(1)'
          inner.style.boxShadow = `0 2px 12px ${shadow}`
        }
        el.onclick = () => setSelectedCity(group)

        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([group.lng, group.lat])
            .addTo(map.current!)
        )
      }
    })

    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    }
  }, [cityGroups, zoomLevel])

  // ── Playback ─────────────────────────────────────────────────────────────
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

      {/* ── Off-screen edge indicators ──────────────────────────────────── */}
      {offScreen.map(ind => (
        <button
          key={ind.city}
          onClick={() => map.current?.flyTo({
            center: [ind.lng, ind.lat],
            zoom: Math.max((map.current?.getZoom() ?? 3), 5),
            duration: 1400,
            essential: true,
          })}
          style={{ position: 'absolute', left: ind.screenX, top: ind.screenY, transform: 'translate(-50%,-50%)' }}
          className="flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:scale-110 transition-transform z-20 pointer-events-auto"
          title={`Fly to ${ind.city}`}
        >
          <ArrowRight size={11} style={{ transform: `rotate(${ind.angleDeg}deg)`, flexShrink: 0 }} />
          <span className="max-w-[80px] truncate">{ind.city}</span>
          {ind.profiles.length > 1 && (
            <span className="bg-white/25 rounded-full px-1 tabular-nums">{ind.profiles.length}</span>
          )}
        </button>
      ))}

      {/* ── Hover profile card ───────────────────────────────────────────── */}
      {hoverCard && (
        <ProfileHoverCard
          card={hoverCard}
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
          onMouseLeave={() => setHoverCard(null)}
        />
      )}

      {/* ── Week slider panel ────────────────────────────────────────────── */}
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

      {/* ── City detail popup (cluster mode) ────────────────────────────── */}
      {selectedCity && (
        <div className="absolute top-4 right-4 w-72 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-10">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{selectedCity.city}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Users size={10} />
                {selectedCity.profiles.length} classmate{selectedCity.profiles.length !== 1 ? 's' : ''} this week
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => {
                  map.current?.flyTo({ center: [selectedCity.lng, selectedCity.lat], zoom: SPLIT_ZOOM + 1, duration: 1200, essential: true })
                  setSelectedCity(null)
                }}
                className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition"
                title="Zoom in to see individuals"
              >
                Zoom in
              </button>
              <button onClick={() => setSelectedCity(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {selectedCity.profiles.map(profile => {
              const visiting = isVisitorExperience(profile.currentExperience)
              return (
                <Link key={profile.id} href={`/profile/${profile.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-accent transition-colors">
                  <div className={`relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(profile.full_name)}`}>
                    {profile.photo_url
                      ? <Image src={profile.photo_url} alt={profile.full_name} fill className="object-cover" unoptimized />
                      : getInitials(profile.full_name)
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{profile.full_name}</p>
                      {visiting && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 font-medium">
                          ✈ visiting
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {profile.currentExperience?.neighborhood
                        ? profile.currentExperience.neighborhood
                        : [profile.currentExperience?.role, profile.currentExperience?.company].filter(Boolean).join(' @ ')
                          || profile.currentExperience?.label
                          || ''}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Hint + legend + reset button ────────────────────────────────── */}
      <div className="absolute top-4 left-4 flex items-start gap-2">
        <div className="flex flex-col gap-1.5">
          <div className="rounded-xl border border-border bg-card/90 backdrop-blur-sm px-3 py-2 text-xs text-muted-foreground">
            {zoomLevel >= SPLIT_ZOOM
              ? 'Hover to preview · Click to view profile'
              : 'Click a marker to see classmates · Drag to explore'}
          </div>
          <div className="rounded-xl border border-border bg-card/90 backdrop-blur-sm px-3 py-2 text-xs text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              Based
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
              Visiting
            </span>
          </div>
        </div>
        <button
          onClick={() => map.current?.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM, duration: 1200, essential: true })}
          className="rounded-xl border border-border bg-card/90 backdrop-blur-sm p-2 text-muted-foreground hover:text-foreground hover:bg-card transition"
          title="Reset view"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}

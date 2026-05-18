'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Profile, Location, SUMMER_WEEKS } from '@/lib/types'
import { getSummerWeeks, getLocationAtWeek, avatarColor, getInitials } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Play, Pause, Users, ArrowRight, RotateCcw, Home, Plane, X } from 'lucide-react'
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
  x: number
  y: number
  above: boolean
}

const INITIAL_CENTER: [number, number] = [-100, 40]
const INITIAL_ZOOM = 4
// Below SPLIT_ZOOM: one aggregate circle per city.
// At/above SPLIT_ZOOM: individual circles spread around the city center.
const SPLIT_ZOOM = 9

/**
 * Fans N profiles in a ring around (baseLng, baseLat).
 * 0.02° ≈ 2.2 km; circles visually separate by zoom 11.
 */
function spreadCoords(
  baseLng: number, baseLat: number,
  index: number, total: number
): [number, number] {
  if (total === 1) return [baseLng, baseLat]
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  const r = 0.02
  return [baseLng + r * Math.cos(angle), baseLat + r * Math.sin(angle)]
}

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

// ── Profile card (hover preview + click-pinned) ───────────────────────────────
function ProfileHoverCard({
  card,
  onMouseEnter,
  onMouseLeave,
  showClose,
  onClose,
}: {
  card: HoverCard
  onMouseEnter: () => void
  onMouseLeave: () => void
  showClose?: boolean
  onClose?: () => void
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

      <div className="p-3.5 relative">
        {showClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={13} />
          </button>
        )}

        {/* Header row */}
        <div className={`flex items-center gap-2.5 mb-2 ${showClose ? 'pr-5' : ''}`}>
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

        {expLine && (
          <p className="text-xs text-muted-foreground mb-2.5 truncate">{expLine}</p>
        )}

        {/* ?from=map so the profile page can show "← Back to map" */}
        <Link
          href={`/profile/${card.profile.id}?from=map`}
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
  const cityGroupsRef = useRef<CityGroup[]>([])
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
  // hoverCard: lightweight preview shown while hovering over a single-person marker
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null)
  // clickCard: persistent card shown after clicking a marker; stays until dismissed
  const [clickCard, setClickCard] = useState<HoverCard | null>(null)

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

  cityGroupsRef.current = cityGroups

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

  // ── Track viewport + zoom ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const update = () => {
      if (!map.current || !mapContainer.current) return
      setMapBounds(map.current.getBounds() ?? null)
      setMapSize({ w: mapContainer.current.offsetWidth, h: mapContainer.current.offsetHeight })
      setZoomLevel(map.current.getZoom())
    }
    const dismiss = () => {
      setHoverCard(null)
      setClickCard(null)
    }
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

  // ── GL source + layers (once after map loads) ────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const m = map.current

    m.addSource('classmates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

    // ── Aggregate circles (zoom < SPLIT_ZOOM) ──────────────────────────────
    m.addLayer({
      id: 'classmate-circles-group',
      type: 'circle',
      source: 'classmates',
      maxzoom: SPLIT_ZOOM,
      filter: ['==', ['get', 'featureType'], 'group'],
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['case', ['get', 'allVisitors'], '#0ea5e9', '#8C1515'],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    })
    m.addLayer({
      id: 'classmate-labels-group',
      type: 'symbol',
      source: 'classmates',
      maxzoom: SPLIT_ZOOM,
      filter: ['==', ['get', 'featureType'], 'group'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff' },
    })

    // ── Individual circles (zoom >= SPLIT_ZOOM) ────────────────────────────
    m.addLayer({
      id: 'classmate-circles-individual',
      type: 'circle',
      source: 'classmates',
      minzoom: SPLIT_ZOOM,
      filter: ['==', ['get', 'featureType'], 'individual'],
      paint: {
        'circle-radius': 16,
        'circle-color': ['case', ['get', 'isVisitor'], '#0ea5e9', '#8C1515'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })
    m.addLayer({
      id: 'classmate-labels-individual',
      type: 'symbol',
      source: 'classmates',
      minzoom: SPLIT_ZOOM,
      filter: ['==', ['get', 'featureType'], 'individual'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff' },
    })

    // Cursor pointer on hover
    ;(['classmate-circles-group', 'classmate-circles-individual'] as const).forEach(id => {
      m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', id, () => { m.getCanvas().style.cursor = '' })
    })
  }, [mapLoaded])

  // ── Update GL source data when city groups change ─────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const source = map.current.getSource('classmates') as mapboxgl.GeoJSONSource
    if (!source) return

    // One aggregate feature per city
    const groupFeatures = cityGroups.map(group => {
      const count = group.profiles.length
      const residentCount = group.profiles.filter(p => !isVisitorExperience(p.currentExperience)).length
      const allVisitors = residentCount === 0
      const label = count === 1
        ? getInitials(group.profiles[0].full_name)
        : (allVisitors ? `✈${count}` : String(count))
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [group.lng, group.lat] },
        properties: {
          featureType: 'group',
          city: group.city,
          count,
          allVisitors,
          label,
          radius: Math.max(18, 14 + count * 2),
        },
      }
    })

    // One feature per person, spread in a ring around the city center
    const individualFeatures = cityGroups.flatMap(group =>
      group.profiles.map((profile, idx) => {
        const [sLng, sLat] = spreadCoords(group.lng, group.lat, idx, group.profiles.length)
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [sLng, sLat] },
          properties: {
            featureType: 'individual',
            profileId: profile.id,
            city: group.city,
            isVisitor: isVisitorExperience(profile.currentExperience),
            label: getInitials(profile.full_name),
          },
        }
      })
    )

    source.setData({ type: 'FeatureCollection', features: [...groupFeatures, ...individualFeatures] })
  }, [cityGroups, mapLoaded])

  // ── GL click + hover handlers ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const m = map.current

    // Click on aggregate circle: open city panel (multi) or profile card (single)
    const handleGroupClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      const group = cityGroupsRef.current.find(g => g.city.toLowerCase() === props.city.toLowerCase())
      if (!group) return
      if (group.profiles.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coords = (e.features![0].geometry as any).coordinates as [number, number]
        const proj = m.project(coords)
        setClickCard({ profile: group.profiles[0], x: proj.x, y: proj.y, above: proj.y > 160 })
        setHoverCard(null)
      } else {
        setSelectedCity(group)
        setClickCard(null)
      }
    }

    // Click on individual circle: open profile card
    const handleIndividualClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties
      if (!props?.profileId) return
      let found: (MapProfile & { currentExperience?: ExperienceSnippet }) | undefined
      for (const group of cityGroupsRef.current) {
        found = group.profiles.find(p => p.id === props.profileId)
        if (found) break
      }
      if (!found) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coords = (e.features![0].geometry as any).coordinates as [number, number]
      const proj = m.project(coords)
      setClickCard({ profile: found, x: proj.x, y: proj.y, above: proj.y > 160 })
      setHoverCard(null)
    }

    // Hover over aggregate circle: lightweight preview for single-person cities
    const handleGroupMousemove = (e: mapboxgl.MapLayerMouseEvent) => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
      const feature = e.features?.[0]
      if (!feature?.properties || feature.properties.count > 1) { setHoverCard(null); return }
      const group = cityGroupsRef.current.find(g => g.city.toLowerCase() === feature.properties!.city.toLowerCase())
      if (!group || group.profiles.length !== 1) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coords = (feature.geometry as any).coordinates as [number, number]
      const proj = m.project(coords)
      setHoverCard({ profile: group.profiles[0], x: proj.x, y: proj.y, above: proj.y > 160 })
    }

    // Hover over individual circle: lightweight preview
    const handleIndividualMousemove = (e: mapboxgl.MapLayerMouseEvent) => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
      const feature = e.features?.[0]
      if (!feature?.properties?.profileId) return
      let found: (MapProfile & { currentExperience?: ExperienceSnippet }) | undefined
      for (const group of cityGroupsRef.current) {
        found = group.profiles.find(p => p.id === feature.properties!.profileId)
        if (found) break
      }
      if (!found) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coords = (feature.geometry as any).coordinates as [number, number]
      const proj = m.project(coords)
      setHoverCard({ profile: found, x: proj.x, y: proj.y, above: proj.y > 160 })
    }

    const handleMouseleave = () => {
      hoverTimeout.current = setTimeout(() => setHoverCard(null), 160)
    }

    m.on('click', 'classmate-circles-group', handleGroupClick)
    m.on('click', 'classmate-circles-individual', handleIndividualClick)
    m.on('mousemove', 'classmate-circles-group', handleGroupMousemove)
    m.on('mousemove', 'classmate-circles-individual', handleIndividualMousemove)
    m.on('mouseleave', 'classmate-circles-group', handleMouseleave)
    m.on('mouseleave', 'classmate-circles-individual', handleMouseleave)

    return () => {
      m.off('click', 'classmate-circles-group', handleGroupClick)
      m.off('click', 'classmate-circles-individual', handleIndividualClick)
      m.off('mousemove', 'classmate-circles-group', handleGroupMousemove)
      m.off('mousemove', 'classmate-circles-individual', handleIndividualMousemove)
      m.off('mouseleave', 'classmate-circles-group', handleMouseleave)
      m.off('mouseleave', 'classmate-circles-individual', handleMouseleave)
    }
  }, [mapLoaded])

  // ── Escape key dismisses pinned card and city panel ───────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setClickCard(null); setSelectedCity(null) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Playback ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      if (weekIndex >= SUMMER_WEEKS - 1) setPlaying(false)
      else setWeekIndex(weekIndex + 1)
    }, 800)
    return () => clearInterval(interval)
  }, [playing, weekIndex, setWeekIndex])

  // zoomLevel is read by TypeScript; suppress the unused-var warning by referencing it
  void zoomLevel

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

      {/* ── Hover preview card (suppressed when a click card is pinned) ─── */}
      {hoverCard && !clickCard && (
        <ProfileHoverCard
          card={hoverCard}
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
          onMouseLeave={() => setHoverCard(null)}
        />
      )}

      {/* ── Pinned profile card (shown on click, dismissed explicitly) ───── */}
      {clickCard && (
        <ProfileHoverCard
          card={clickCard}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
          showClose
          onClose={() => setClickCard(null)}
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

      {/* ── City detail popup (multi-person cluster) ─────────────────────── */}
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
                <Link
                  key={profile.id}
                  href={`/profile/${profile.id}?from=map`}
                  className="flex items-center gap-3 p-3 hover:bg-accent transition-colors"
                >
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
            Click a marker to explore · Drag to pan
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
          title="Return to default view"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}

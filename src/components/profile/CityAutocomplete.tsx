'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CityResult {
  id: string
  place_name: string
  city: string
  country: string
  state: string | null
  lat: number
  lng: number
}

interface Props {
  value: string
  onChange: (result: CityResult | null) => void
  placeholder?: string
  className?: string
}

export function CityAutocomplete({ value, onChange, placeholder = 'Search city…', className }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<CityResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function selectResult(r: CityResult) {
    setQuery(r.city)
    setOpen(false)
    onChange(r)
  }

  function clear() {
    setQuery('')
    onChange(null)
    setResults([])
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) onChange(null) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
        {!loading && query && (
          <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-border bg-popover shadow-lg py-1 z-50 max-h-56 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.id}
              onMouseDown={() => selectResult(r)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <div className="font-medium">{r.city}</div>
              <div className="text-xs text-muted-foreground">
                {r.state ? `${r.state}, ` : ''}{r.country}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

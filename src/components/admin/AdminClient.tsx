'use client'

import { useState } from 'react'
import { Profile, Location, TravelInterest, Trek, TrekInterest } from '@/lib/types'
import { formatDateRange } from '@/lib/utils'
import { Download, Users, MapPin, Compass, Search } from 'lucide-react'
import Link from 'next/link'
import Papa from 'papaparse'

type FullProfile = Profile & { locations: Location[]; travel_interests: TravelInterest[] }
type FullTrek = Trek & { trek_interests: (TrekInterest & { profile: Pick<Profile, 'id' | 'full_name'> | undefined })[] }

interface Props {
  profiles: FullProfile[]
  treks: FullTrek[]
}

export function AdminClient({ profiles, treks }: Props) {
  const [tab, setTab] = useState<'classmates' | 'treks'>('classmates')
  const [search, setSearch] = useState('')

  function exportCSV() {
    const rows = profiles.flatMap(p =>
      p.locations?.length
        ? p.locations.map((loc, i) => ({
            name: p.full_name,
            section: p.section ?? '',
            pre_mba_company: p.pre_mba_company ?? '',
            pre_mba_role: p.pre_mba_role ?? '',
            linkedin_url: p.linkedin_url ?? '',
            stop_order: String(i + 1),
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
            pre_mba_company: p.pre_mba_company ?? '',
            pre_mba_role: p.pre_mba_role ?? '',
            linkedin_url: p.linkedin_url ?? '',
            stop_order: '',
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
    (p.pre_mba_company ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.section ?? '').toLowerCase().includes(search.toLowerCase())
  )

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
          {(['classmates', 'treks'] as const).map(t => (
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
                  {['Name', 'Section', 'Company', 'Locations', 'Interests'].map(h => (
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
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]">
                      {[p.pre_mba_role, p.pre_mba_company].filter(Boolean).join(' @ ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.locations?.length
                        ? <div className="space-y-0.5">
                            {p.locations.sort((a, b) => a.sort_order - b.sort_order).map(l => (
                              <div key={l.id} className="text-xs text-muted-foreground">
                                {l.city} · {formatDateRange(l.start_date, l.end_date)}
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
    </div>
  )
}

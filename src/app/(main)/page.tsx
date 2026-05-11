import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Map, Users, Compass, ArrowRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createClient()
  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const { count: locationCount } = await supabase
    .from('locations')
    .select('*', { count: 'exact', head: true })

  const { data: cities } = await supabase
    .from('locations')
    .select('city, country')
    .order('city')

  const uniqueCities = cities ? [...new Set(cities.map(l => l.city))].length : 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      {/* Hero */}
      <div className="text-center space-y-4 pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2">
          <span>✦</span> MBA Class of 2027 · Summer 2026
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Where is your cohort<br />
          <span className="text-primary">this summer?</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Track where classmates are headed, discover overlap, and coordinate adventures — from weekend hikes to multi-week treks.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <Map size={15} />
            Open map
          </Link>
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-accent transition"
          >
            Add my location
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        {[
          { value: profileCount ?? 0, label: 'Classmates' },
          { value: uniqueCities, label: 'Cities' },
          { value: locationCount ?? 0, label: 'Stops logged' },
        ].map(({ value, label }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            icon: Map,
            title: 'Interactive map',
            description: "See everyone's location week by week with an animated time slider across all 16 summer weeks.",
            href: '/map',
            cta: 'Explore map',
          },
          {
            icon: Users,
            title: 'Classmate directory',
            description: "Browse all classmates, filter by city or week, and instantly see who you'll overlap with.",
            href: '/directory',
            cta: 'Browse classmates',
          },
          {
            icon: Compass,
            title: 'Group treks',
            description: 'Admin-organized trips to off-the-beaten-path destinations. Signal your interest and coordinate.',
            href: '/treks',
            cta: 'See treks',
          },
        ].map(({ icon: Icon, title, description, href, cta }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-border bg-card p-6 hover:shadow-md transition-all hover:border-primary/30"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Icon size={18} className="text-primary" />
            </div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            <div className="mt-4 flex items-center gap-1 text-sm text-primary font-medium">
              {cta} <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

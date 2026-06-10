import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateRange } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Calendar, Users, DollarSign, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createAdminClient()
  const { data: trek } = await supabase.from('treks').select('title, destination_city').eq('id', id).single()
  if (!trek) return { title: 'Trek — GSB27 Summer 2026' }
  return { title: `${trek.title} · GSB27 Summer 2026` }
}

export default async function PublicTrekPage({ params }: Props) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: trek } = await supabase
    .from('treks')
    .select('*, trek_interests(id, status, profile_id)')
    .eq('id', id)
    .single()

  if (!trek) notFound()

  const interested = (trek.trek_interests ?? []).filter((i: { status: string }) => i.status !== 'declined')
  const confirmed = (trek.trek_interests ?? []).filter((i: { status: string }) => i.status === 'confirmed')

  const costLabel = trek.cost_tier === 'budget' ? '$' : trek.cost_tier === 'moderate' ? '$$' : trek.cost_tier === 'premium' ? '$$$' : null

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">GSB MBA27 · Summer 2026</p>
          <h1 className="text-2xl font-bold tracking-tight">{trek.title}</h1>
        </div>

        {/* Trek card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin size={14} />
              {trek.destination_city}
              {trek.destination_country !== 'United States' ? `, ${trek.destination_country}` : ''}
            </span>
            {(trek.proposed_start || trek.proposed_end) && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar size={14} />
                {formatDateRange(trek.proposed_start, trek.proposed_end)}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users size={14} />
              {interested.length} interested{confirmed.length > 0 ? `, ${confirmed.length} confirmed` : ''}
              {trek.max_group_size ? ` · max ${trek.max_group_size}` : ''}
            </span>
            {costLabel && (
              <span className="flex items-center gap-0.5 text-sm text-muted-foreground">
                {costLabel.split('').map((_, i) => (
                  <DollarSign key={i} size={12} className="text-amber-500" />
                ))}
              </span>
            )}
          </div>

          {trek.description && (
            <p className="text-sm leading-relaxed text-foreground/80">{trek.description}</p>
          )}

          {trek.activity_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trek.activity_tags.map((tag: string) => (
                <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-accent text-accent-foreground border border-border">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3">
              This trip is organized on the GSB MBA27 Summer Coordination site — log in to see who&rsquo;s interested and mark yourself in.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              Log in to join <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-8">
          GSB MBA27 Summer 2026 · Classmates only
        </p>
      </div>
    </div>
  )
}

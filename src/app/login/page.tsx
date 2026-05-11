'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (cooldown <= 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => setCooldown(s => Math.max(0, s - 1)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [cooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.toLowerCase().endsWith('@stanford.edu')) {
      setError('Please use your @stanford.edu email address.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: email.split('@')[0] },
      },
    })

    if (error) {
      const match = error.message.match(/after (\d+) seconds?/i)
      if (match) {
        setCooldown(parseInt(match[1], 10))
      } else {
        setError(error.message)
      }
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  const isDisabled = loading || !email || cooldown > 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
            <MapPin className="text-primary" size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">GSB Summer '26</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Where is your cohort this summer?
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Stanford email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@stanford.edu"
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {cooldown > 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Link sent — resend available in {cooldown}s
                </p>
              )}

              <button
                type="submit"
                disabled={isDisabled}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send magic link'}
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              No password needed — we'll email you a one-click sign-in link.
            </p>
          </form>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-2">
            <div className="text-2xl mb-2">✉️</div>
            <h2 className="font-semibold">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

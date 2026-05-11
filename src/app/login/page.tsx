'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Stanford Tree SVG mark
function StanfordTree({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 52" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      {/* Trunk */}
      <rect x="21" y="42" width="6" height="10" rx="1" fill="currentColor" opacity="0.8" />
      {/* Lower boughs */}
      <polygon points="24,6 4,44 44,44" fill="currentColor" opacity="0.25" />
      {/* Middle layer */}
      <polygon points="24,14 7,40 41,40" fill="currentColor" opacity="0.45" />
      {/* Upper layer */}
      <polygon points="24,4 11,32 37,32" fill="currentColor" opacity="0.7" />
      {/* Top */}
      <polygon points="24,0 15,24 33,24" fill="currentColor" />
    </svg>
  )
}

function LoginContent() {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const supabase = createClient()

  const errorMessages: Record<string, string> = {
    not_stanford: 'Only @stanford.edu Google accounts are allowed.',
    auth_failed:  'Sign-in failed — please try again.',
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'stanford.edu' },  // hints Google to show Stanford accounts first
      },
    })
    if (error) setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 -right-48 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-48 -left-48 w-[28rem] h-[28rem] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
            <StanfordTree className="w-7 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">GSB Summer '26</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Where is your cohort this summer?
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm space-y-5">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 text-center">
              {errorMessages[error] ?? 'Something went wrong — please try again.'}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-border bg-card hover:bg-accent text-foreground text-sm font-medium transition-all disabled:opacity-60 shadow-sm hover:shadow"
          >
            {/* Google "G" logo */}
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Redirecting…' : 'Sign in with Google'}
          </button>

          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            Use your <span className="font-medium text-foreground">@stanford.edu</span> Google account.<br />
            Non-Stanford accounts will be declined.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          GSB MBA Class of 2027 · Summer Travel Tracker
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Sun, Moon, Monitor, Map, Users, Plane, Shield, User, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Profile } from '@/lib/types'
import { useState } from 'react'

function StanfordTree({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 52" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <rect x="21" y="42" width="6" height="10" rx="1" fill="currentColor" opacity="0.8" />
      <polygon points="24,6 4,44 44,44" fill="currentColor" opacity="0.25" />
      <polygon points="24,14 7,40 41,40" fill="currentColor" opacity="0.45" />
      <polygon points="24,4 11,32 37,32" fill="currentColor" opacity="0.7" />
      <polygon points="24,0 15,24 33,24" fill="currentColor" />
    </svg>
  )
}

const NAV_LINKS = [
  { href: '/map',       label: 'Map',       icon: Map   },
  { href: '/directory', label: 'Directory', icon: Users },
  { href: '/treks',     label: 'Treks',     icon: Plane },
]

export function Navbar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  const themeIcons = { light: Sun, dark: Moon, system: Monitor }
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const ThemeIcon = themeIcons[theme as keyof typeof themeIcons] ?? Monitor

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = profile?.full_name?.split(' ').slice(0, 2).map(n => n[0]).join('') ?? '?'

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-sm group">
          <StanfordTree className="w-5 h-5 text-primary transition-transform group-hover:scale-110" />
          <span className="hidden sm:inline text-foreground">GSB Summer <span className="text-primary">'26</span></span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
          {profile?.is_admin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Shield size={14} />
              Admin
            </Link>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(nextTheme)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle theme"
          >
            <ThemeIcon size={16} />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold">
                {initials}
              </div>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-popover shadow-xl py-1 z-50">
                  <div className="px-3 py-2.5 border-b border-border mb-1">
                    <p className="text-xs font-medium text-foreground truncate">{profile?.full_name ?? 'Loading…'}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile?.section ? `Section ${profile.section}` : 'GSB MBA27'}</p>
                  </div>
                  <Link
                    href="/profile/edit"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <User size={14} className="text-muted-foreground" />
                    My Profile
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

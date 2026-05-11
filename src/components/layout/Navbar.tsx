'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Sun, Moon, Monitor, Map, Users, Compass, Shield, User, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Profile } from '@/lib/types'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/map', label: 'Map', icon: Map },
  { href: '/directory', label: 'Directory', icon: Users },
  { href: '/treks', label: 'Treks', icon: Compass },
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

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
          <span className="text-primary">✦</span>
          <span>GSB Summer '26</span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
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
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                {profile?.full_name?.split(' ').slice(0, 2).map(n => n[0]).join('') ?? '?'}
              </div>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-popover shadow-lg py-1 z-50">
                <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                  {profile?.full_name ?? 'Loading...'}
                </div>
                <Link
                  href="/profile/edit"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <User size={14} />
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
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

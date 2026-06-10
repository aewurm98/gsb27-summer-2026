# Trek Email & Notification System — Execution Plan

> **Purpose:** Step-by-step guide for implementing proper email invites and trek
> notification subscriptions. Pick this up in a fresh Claude Code conversation.
>
> **Repo:** `gsb27-summer-2026` · **Project root:** `gsb27-summer-2026/`
> **Supabase project:** `rswczmdvmbugpunfumyf` (us-west-1)
> **Deployed at:** https://gsb27-summer-2026.vercel.app

---

## Current State (as of 2026-06-09)

### What exists: `mailto:` invite panel on trek cards

The Treks page already has a working invite panel (`TreksClient.tsx`). When a trek
creator (or co-admin/admin) clicks the mail icon on a trek card:

1. A panel opens showing all classmates, pre-selecting those with a matching `travel_interest`
2. User toggles classmates in/out with a search filter
3. A live email preview shows the templatized body + FOMO mystery line
4. "Open in mail app" fires a `mailto:?bcc=emails&subject=...&body=...` link

### What `mailto:` can and cannot do

| Can do | Cannot do |
|---|---|
| Open user's configured email client | Work for webmail-only users (no desktop client) |
| Pre-fill To/Subject/Body | Work reliably on mobile |
| Use user's own identity | Guarantee FROM is their Stanford email |
| Free, no infrastructure | Send automatically / on a schedule |
| — | Trek notification subscriptions |
| — | Delivery tracking |

**For a Stanford MBA class on laptops with Outlook/Apple Mail configured, `mailto:` will
work for ~80% of use cases.** It is NOT sufficient for automated trek notifications.

---

## What Needs to Be Built

### Part A — Upgrade invites: Resend API (replaces mailto for reliability)

Sends from a real email address, works without a desktop client, enables mobile.

- **FROM:** `[Organizer Name] via GSB Summer '26 <trek@yourdomain.com>`
- **Reply-To:** organizer's `@stanford.edu` address (so replies go directly to them)
- **BCC behavior:** server sends one email per recipient (no BCC needed, fully personalized)

> **"Sends from their Stanford email" is not achievable programmatically** without
> OAuth integration with Stanford's Microsoft Azure AD / Google Workspace per user.
> The practical solution is Reply-To = their Stanford email, which is equivalent for
> recipients (they reply to the right person).

### Part B — Trek notification subscriptions

Automated emails triggered by trek events:
- New trek created for a destination you've expressed interest in
- Someone joins a trek you're on (encourages commitment)
- Trek organizer posts an update/message

Users subscribe automatically when they mark "Interested" on a trek, and can
unsubscribe with one click in the email or on the trek card.

---

## Prerequisites (User action required before coding)

### 1. Create a Resend account

1. Go to https://resend.com and sign up (free tier: 3,000 emails/month, 100/day)
2. **If you own a domain** (e.g. `gsb27summer2026.com`):
   - Add domain in Resend → Domains → Add Domain
   - Add the 3 DNS records Resend provides (DKIM + SPF)
   - Sending address will be e.g. `trek@gsb27summer2026.com`
3. **If you don't own a domain:**
   - Resend provides a free `@resend.dev` address for testing
   - Emails say "from onboarding@resend.dev" — fine for internal class use
4. Get your API key: Resend Dashboard → API Keys → Create API Key (full access)

### 2. Add environment variable to Vercel

In Vercel Dashboard → Project → Settings → Environment Variables:
```
RESEND_API_KEY = re_xxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL = trek@yourdomain.com   (or onboarding@resend.dev for testing)
```

Also add to local `.env.local` for dev testing.

---

## Implementation Steps

### Step 0: Install Resend SDK (5 min)

```bash
npm install resend @react-email/components
```

### Step 1: DB migration — notification preferences (15 min)

Apply via Supabase MCP (`project_id: rswczmdvmbugpunfumyf`):

```sql
-- Trek notification preferences (one row per profile, lazy-created on first subscribe)
CREATE TABLE IF NOT EXISTS trek_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notify_new_treks boolean NOT NULL DEFAULT true,
  notify_member_joins boolean NOT NULL DEFAULT true,
  notify_trek_updates boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

ALTER TABLE trek_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prefs"
  ON trek_notification_prefs FOR ALL
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Service role bypass for API routes
CREATE POLICY "Service role full access"
  ON trek_notification_prefs FOR ALL
  USING (auth.role() = 'service_role');
```

Also add `unsubscribe_token uuid DEFAULT gen_random_uuid()` on the `trek_interests`
table for one-click unsubscribe links in emails:

```sql
ALTER TABLE trek_interests ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();
```

### Step 2: Email template components (1–2 hours)

Create `src/components/email/` directory with React Email templates:

**`src/components/email/TrekInviteEmail.tsx`**
```tsx
// React Email component for trek invites
// Props: organizerName, city, trekUrl, mysteryCount, dates?
// Design: Stanford cardinal + clean card layout matching app branding
```

**`src/components/email/TrekNotificationEmail.tsx`**
```tsx
// Generic notification template
// Props: recipientName, notificationType, trekTitle, city, actionUrl, unsubscribeUrl
```

Reference React Email docs: https://react.email/docs/introduction

### Step 3: Resend API route for invites (1–2 hours)

Create `src/app/api/trek/invite/route.ts`:

```typescript
// POST /api/trek/invite
// Body: { trekId: string; recipientIds: string[] }
// Auth: must be trek creator, co-admin, or admin
// - Fetches trek + organizer profile from Supabase (service role client)
// - Fetches recipient profiles + emails
// - Sends one email per recipient via Resend (personalized greeting)
// - Returns { sent: number; skipped: number }
```

Key implementation notes:
- Use the **service role** Supabase client (needs `SUPABASE_SERVICE_ROLE_KEY` env var) to read emails
- Rate limit: Resend free tier is 100/day — batch large sends or queue them
- Use `Promise.allSettled` when sending to multiple recipients (don't fail all if one bounces)

### Step 4: Update TreksClient for API-based sending (1 hour)

Modify `src/components/treks/TreksClient.tsx`:

- Keep "Open in mail app" as fallback option
- Add "Send via app" button that calls `POST /api/trek/invite`
- Show loading state + success/error feedback after send
- Display "Sent to X classmates" confirmation

### Step 5: Trek notification triggers (2–3 hours)

Create `src/app/api/trek/notify/route.ts`:

```typescript
// Internal API called whenever a trek event occurs
// POST /api/trek/notify
// Body: { event: 'member_joined' | 'trek_updated' | 'new_trek', trekId: string, actorId?: string }
// - Looks up who is subscribed (trek_interests with status='interested'/'confirmed')
// - Checks their trek_notification_prefs
// - Sends notification emails via Resend (batched)
```

Call this route from:
- `TreksClient.handleInterest()` → when someone marks interested → fire `member_joined` to organizer
- `TreksClient.handleCreateTrek()` → after insert → fire `new_trek` to everyone who has 
  matching `travel_interests` for that destination
- Future: trek edit form → fire `trek_updated` to all interested members

### Step 6: Subscribe/unsubscribe UI (1 hour)

In `TreksClient.tsx`, on each trek card footer:
- If user is "interested" in a trek → show notification bell icon (on/off toggle)
- Clicking bell toggles their `notify_member_joins` / `notify_trek_updates` pref for that trek

One-click unsubscribe in emails:
- Each email footer links to `GET /api/trek/unsubscribe?token=<unsubscribe_token>`
- Handler sets `trek_interests.status = 'declined'` and upserts `notify_*=false` in prefs

### Step 7: New-trek notifications for travel interest matches (1 hour)

When a new trek is created, notify classmates who expressed `travel_interest` in that destination
but haven't yet seen the trek. This is the highest-engagement notification.

```typescript
// In handleCreateTrek (after insert):
// 1. Fetch all profile_ids from travel_interests WHERE destination_city = trek.destination_city
// 2. Exclude the creator
// 3. POST /api/trek/notify { event: 'new_trek', trekId, recipientIds }
```

---

## File Change Summary

| File | Change |
|---|---|
| `src/app/api/trek/invite/route.ts` | **New** — Resend-powered invite sender |
| `src/app/api/trek/notify/route.ts` | **New** — event-triggered notification sender |
| `src/app/api/trek/unsubscribe/route.ts` | **New** — one-click unsubscribe handler |
| `src/components/email/TrekInviteEmail.tsx` | **New** — React Email invite template |
| `src/components/email/TrekNotificationEmail.tsx` | **New** — React Email notification template |
| `src/components/treks/TreksClient.tsx` | Add "Send via app" button, notification bell toggle |
| `src/lib/supabase/service.ts` | **New** — service-role Supabase client for API routes |
| DB: `trek_notification_prefs` | **New table** (migration above) |
| DB: `trek_interests.unsubscribe_token` | **New column** (migration above) |

---

## Cost / Limits

| Service | Free tier | Sufficient? |
|---|---|---|
| Resend | 3,000 emails/month, 100/day | ✅ Yes for ~150 classmates |
| Supabase | Already in use | ✅ |
| Vercel | Already in use | ✅ |

**Total additional monthly cost: $0** until you exceed 3,000 emails/month.

---

## What mailto: handles vs. what Resend handles

| Scenario | mailto: (today) | Resend (after this plan) |
|---|---|---|
| Organizer invites 10 classmates | ✅ Opens mail client | ✅ Sends directly, no client needed |
| Recipient on mobile | ❌ Unreliable | ✅ Works |
| Automated "new trek" alert | ❌ Not possible | ✅ |
| "Someone joined your trek" | ❌ Not possible | ✅ |
| FROM = Stanford email | ✅ If client configured | ⚠️ FROM=service, Reply-To=Stanford |
| Delivery tracking | ❌ | ✅ Resend dashboard |
| Unsubscribe link | ❌ | ✅ |

---

## Context for the next conversation

Key things to tell Claude:

1. Resend account is set up with API key `RESEND_API_KEY` in Vercel env vars
2. Sending domain / from address is `RESEND_FROM_EMAIL` in env vars
3. DB migrations in Step 1 have (or have not) been applied yet
4. The existing invite panel in `TreksClient.tsx` uses `mailto:` — keep it as fallback,
   add "Send via app" as the primary button
5. Service role key is `SUPABASE_SERVICE_ROLE_KEY` (check Supabase dashboard →
   Project Settings → API → service_role key, add to Vercel env vars)

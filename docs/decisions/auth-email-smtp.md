# Auth email / SMTP decisions

## 2026-07-26 — Corrected understanding: Supabase default mailer recipient gating

**Previous assumption:** Resend sandbox mode + Supabase custom SMTP config
would be sufficient to test auth flows with real (non-team) recipients,
blocked only by a 2/hour rate limit.

**Corrected finding:** Supabase's default mailer refuses delivery entirely to
any address outside the project's Supabase org team, independent of rate
limiting. Enabling custom SMTP (even via an unverified Resend account) lifts
this specific Supabase-side restriction, but Resend's own sandbox restriction
(sending only to the Resend account owner's email) then becomes the active
gate. Net result: real public signups remain blocked until a domain is
purchased and verified with Resend — sandbox SMTP config is validation-only.

**Decision:** remain in Resend sandbox mode until closer to public launch.
Domain purchase deferred, not urgent while solo/pre-launch.

Tracked in the outstanding-work index at `deferred-work.md` §A.

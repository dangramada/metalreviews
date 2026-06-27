# Session decisions — Auth + routing (Phase 5, June 2026)

Covers Phase 5 (initial auth + routing) and Phase 5b (signup/password-reset additions), merged here since 5b builds directly on 5.

## Phase 5 — What was built

- React Router (`react-router-dom` v7) added with `createBrowserRouter` in `main.tsx`. Three routes: `/`, `/login`, `/auth/callback`.
- `AuthContext.tsx` — `AuthProvider` + `useAuth()` hook. Hydrates from `supabase.auth.getSession()` on mount; stays in sync via `onAuthStateChange`. Context defaults to `undefined`; hook throws if used outside provider.
- `Header.tsx` — app title + login/logout controls. Logged out: `<Link to="/login">` (React Router). Logged in: email prefix + Log out button.
- `LoginPage.tsx` — email/password form with sign-up/log-in mode toggle. Signup shows confirmation message (Supabase requires email verification by default). OAuth button placeholder left in a comment.
- `AuthCallback.tsx` — uses `onAuthStateChange` to detect the auth event. `PASSWORD_RECOVERY` (from a forgot-password email link) shows an inline "Set new password" form; all other events with a session navigate to `/`; no session navigates to `/login`.
- `server.ts` catch-all: `app.get(/.*/)` → `dist/index.html` so `/login` typed in the address bar doesn't 404 on Render. Regex required by Express v5 (string `'*'` is deprecated).

### What was deferred

- Google and Facebook OAuth — credentials not yet configured. The placeholder comment in `LoginPage.tsx` marks where to add the two `supabase.auth.signInWithOAuth()` buttons.
- Protecting any route behind auth — review browsing is still fully public. If a protected route is needed (e.g. `/list/:shareId` for saved favorites), use a wrapper that checks `useAuth().user` and redirects to `/login`.

### Reserved route shape

`/list/:shareId` — future shareable favorites list. No code yet; the commented-out line in `main.tsx` marks the slot.

### env vars (no new ones added in Phase 5)

Auth uses the existing `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) via `src/supabaseClient.ts`. Supabase Auth is enabled on the same project.

## Phase 5b — additions

- **Signup confirm-password:** `LoginPage` validates that password and confirm-password match client-side before calling `signUp()`. Error shown inline; no API call made on mismatch.
- **Forgot password:** `LoginPage` gains a third mode `'forgot-password'`. Clicking "Forgot password?" shows an email-only form that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/callback' })`. On success shows a neutral "check your email" screen (no email-existence leak).
- **Password recovery at /auth/callback:** `AuthCallback` replaced `getSession()` with an `onAuthStateChange` listener. `PASSWORD_RECOVERY` event shows an inline "Set new password" form (password + confirm-password, same mismatch validation, calls `supabase.auth.updateUser({ password })`). All other events with a session navigate to `/`; no session navigates to `/login`.

---

## Follow-up — Route protection built, reserved route renamed (Phase 7)

"Protecting any route behind auth" — described above as not yet built — was
implemented in the favorites-view session: `RequireAuth` (`src/RequireAuth.tsx`)
is the first reusable auth guard in the codebase, and `/favorites` is now
wrapped in it (redirects to `/login` when logged out).

The reserved `/list/:shareId` slot mentioned above was renamed to
`/aoty/:shareId` to match the actual planned AOTY feature name.

See `favorites-view.md` ("RequireAuth," "Route registration") for full detail.
This note exists so this file is not read in isolation as if no routes are
protected.

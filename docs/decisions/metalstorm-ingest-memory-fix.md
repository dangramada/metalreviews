# Metal Storm ingest memory fix (Render OOM, 2026-09-16)

## Source

Render restarted the `metalreviews` web service twice on 2026-09-16 (12:25 and 12:36 UTC)
after exceeding its memory limit. The crash logs showed six Metal Storm review fetches failing
with `ProtocolError: Runtime.callFunctionOn timed out` within ~2 seconds. The 12:25 restart
lines up with a normal `schedule`-triggered "Scheduled ingest" GitHub Actions run, not a
`workflow_dispatch`. (The Action is fire-and-forget: it gets a 202 from `/api/ingest` in under
a minute, so its green checkmark says nothing about what happened on Render afterwards.)

## Diagnosis (read-only audit, same day)

- **Working hypothesis contradicted:** no leaked browser or page. `page.close()` and
  `browser.close()` were both already in `finally` blocks, and `fetchMetalStormRating` catches
  every error per page, so `Promise.all` never short-circuited and left tabs open.
- **Actual cause:** `fetchMetalStorm()` opened **one tab per unscored feed item, all at once**
  (`Promise.all(needsFetch.map(...))`), in one Chrome sharing the Express web service's
  container. Puppeteer's default `protocolTimeout` (180s) kept memory-starved tabs alive for
  three minutes. Six tabs that started together all hitting the same 180s limit explains six
  `callFunctionOn` timeouts within ~2 seconds. A `Runtime.callFunctionOn` timeout is a
  protocol timeout (renderer unresponsive), not the 15s `goto` or 7s `waitForSelector` timeout.
- **Batch size is capped by the RSS window, not unbounded.** Only items still in
  `metalstorm.net/rss/reviews.xml` (20 items when checked) can be re-fetched. Unscored items are
  retried every run while in the feed and never again once they drop off. So failures push the
  next batch _toward_ 20 but never beyond it. (The audit initially described this as unbounded
  growth; corrected before the fix was scoped.)
- The "Skipping SputnikMusic source due to inaccessible page." log line is unrelated: a stub that
  prints on every run.

## What shipped (`scripts/ingest.ts` only)

1. **Bounded concurrency.** `mapWithConcurrency(items, limit, fn)` (small built-in worker pool,
   no dependency) replaces the `Promise.all`. `METAL_STORM_PAGE_CONCURRENCY = 2`. Worst case
   (20 pages each hitting the 15s + 7s waits) ≈ 3.7 minutes. Acceptable, since the endpoint
   returns 202 immediately.
2. **`protocolTimeout: 30_000`** on launch. It must stay above the longest single CDP call:
   `waitForSelector` holds one `Runtime.callFunctionOn` open for its whole 7s wait.
3. **Launch args** `--disable-dev-shm-usage`, `--disable-gpu`. `--no-sandbox` deliberately not
   added (works today, and dropping the sandbox has a security cost). `--single-process` not
   added (known unstable).
4. **Resource blocking** per page via request interception: `image`, `font`, `media`,
   `stylesheet` are aborted. Scripts are allowed, since the score is JS-rendered. The rating
   selector matches an inline `style` attribute and the extractor reads raw HTML, so no CSS is
   needed. A `{ blockResources }` option exists only for the parity check below.
5. **Close timeouts.** `withTimeout(promise, ms)` races against a timer. `page.close()` gets 5s.
   `browser.close()` gets 10s, then `browser.process()?.kill('SIGKILL')`.
   `withTimeout` attaches an explicit no-op `.catch` to the original promise so a late rejection
   (e.g. `close()` failing after SIGKILL) is never unhandled. Tested:
   `Promise.race`'s own subscription already marks the promise handled, so the unit test passes
   even without the explicit catch. The catch is kept so the guarantee doesn't depend on the
   race implementation.
6. **Batch-size log line:** `Metal Storm: fetching N of M feed items (concurrency 2)`, for
   correlating Render memory graphs with batch size.

**Not shipped (Dan's decision): no retry-count column / schema change.** The RSS window already
caps re-fetches, and with bounded concurrency peak memory no longer scales with batch size.
Retrying is also intentional: a review with too few user votes has no score yet but may get one
later, and a retry cap could permanently skip it.

## Verification

- `scripts/__tests__/metalStormConcurrency.test.ts`: in-flight peak never exceeds the limit over
  20 items; result order preserved; every item processed once; empty-list/limit-larger-than-list
  cases; `withTimeout` value/timeout/early-rejection paths; no `unhandledRejection` when the
  promise rejects after the timeout.
- Full suite 51/51 files, 375/375 tests; `tsc` clean. Lint: no new errors (the one error, `any`
  in `fetchProgressiveSubwayRating`, predates this branch; the new log line carries the same
  `no-console` warning as the file's existing `console.log` calls).
- **Live resource-blocking parity check:** see "Live parity check" below.

## Live parity check

Dan's requirement: confirm scores **match** with resource blocking on vs off, not just that
scores come back. Run from a local, uncommitted read-only script (no Supabase writes) that fetched
each URL twice: "off" used the original launch (no args, default `protocolTimeout`, no
blocking), "on" used `launchMetalStormBrowser()` plus blocking.

**Result: partial. No mismatches, but too few valid samples to call it proven.**

| Run                                        | URLs | Match                     | Non-null in both modes                     |
| ------------------------------------------ | ---- | ------------------------- | ------------------------------------------ |
| Current RSS feed, concurrency 2            | 20   | 20/20                     | 1 (`21379`: 6.4 / 6.4)                     |
| Older IDs, concurrency 2                   | 12   | 12/12                     | 2 (`21254`: 7.5 / 7.5, `21200`: 7.7 / 7.7) |
| Older IDs 21170–21260, concurrency 2       | 31   | 31/31                     | 0, **invalid: Cloudflare-blocked**         |
| Paced, one at a time, HTTP status recorded | 12   | 1 valid, 11 blocked (403) | 0                                          |

**What invalidated most of it:** after ~130 page loads, Metal Storm's Cloudflare started serving
**403 "Just a moment..."** challenge pages to headless Chrome. `extractRating` returns `null` on
those, so both modes agree trivially. A spot inspection proved at least one earlier `null` was
wrong: `21398` has a real user score (7.3, 114 votes), yet both modes returned `null` for it in
the first feed run. So the `null == null` matches in the unpaced runs can't be trusted, and only
the **3 non-null matches** (6.4, 7.5, 7.7) are real evidence. Those are unaffected by
blocking, since a challenge page can't produce a number.

**To close out:** re-run `scratch/check_metalstorm_blocking_parity.mts` (the paced, status-recording variant) after the Cloudflare block expires
(hours, not minutes). Only 200-status pairs count, and it should have several non-null scores.
Tracked in `deferred-work.md` section B.

**Side finding, possibly relevant to production:** Cloudflare challenges headless Puppeteer after
a burst of loads. An ingest run opening up to 20 tabs at once may itself have been served
challenge pages, which would store `null` scores that look like "too few votes". Bounded
concurrency should make this less likely, but it hasn't been observed from Render's IP either way.

## What NOT to change

- Don't go back to `Promise.all` over `needsFetch`, and don't raise
  `METAL_STORM_PAGE_CONCURRENCY` without watching Render's memory graph. Chrome shares the web
  service's container.
- Don't lower `protocolTimeout` below ~20s: `waitForSelector` keeps a single CDP call open for
  its full timeout, and `goto` can take up to 15s.
- Don't remove the `.catch` inside `withTimeout` just because the test passes without it (see
  item 5).
- Don't unblock `script` resources: the score is JS-rendered.

## Open follow-ups

Tracked in `deferred-work.md` section B: watch Render memory across two scheduled runs after
deploy; check Supabase for Metal Storm rows written during the 2026-09-16 incident.

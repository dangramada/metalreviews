# Review Pass - Ingest-Time Rating Scraper & Dashboard Loader

## Issue Severity Check

- **Blocker**: None.
- **Major**: None.
- **Minor**: None. (The `normalizedScore` displayed as % for AMG may read oddly since the raw value e.g. `60` already represents the % after normalizing 6/10 → 60%)
- **Nit**: `Stack` import was removed from App.tsx — it was unused, so clean.

## Verification Results

### Automated Tests

```
✓ src/__tests__/angrymetal.test.js (3 tests) 11ms
Test Files  1 passed (1)
     Tests  3 passed (3)
```

### Production Build

```
✓ 1124 modules transformed.
dist/assets/index-SM9LI20Y.js  434.82 kB │ gzip: 143.25 kB
✓ built in 2.06s
```

No TypeScript errors, no Vite/Babel errors.

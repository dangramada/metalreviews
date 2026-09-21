// src/components/HomeReviewGrid.tsx
//
// Windows the Home page's card grid so only rows near the viewport are mounted — the fetch/
// filter/sort/search pipeline in App.tsx is unchanged, this only changes what used to be a
// plain <SimpleGrid> mapping every filtered album at once. See
// docs/decisions/home-grid-virtualization.md.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Box, Grid, Text, Link, List } from '@chakra-ui/react';
import type { AlbumCard } from '../dbMapping';
import { SCORE_SLAB_HIGH_THRESHOLD, ArtworkBlock } from '../App';
import { AlbumMetaBlock } from './album-rating/AlbumMetaBlock';

// Mirrors Chakra's default `md`/`lg` breakpoint tokens (768px / 992px) — the same values the
// grid's own `columns={{ base: 1, md: 2, lg: 3 }}` prop uses (src/theme.ts has no breakpoint
// override, so these are the library defaults). Kept as plain window-width comparisons rather
// than `useBreakpointValue`/`matchMedia`: this codebase deliberately avoids that hook because
// jsdom doesn't implement `matchMedia` (see docs/decisions/design-system-audit-2026-08.md,
// "Responsive split mechanism"). `window.innerWidth` + a `resize` listener sidesteps that gap
// instead of reintroducing it, and virtualization genuinely needs a numeric column count in
// JS (to group the flat card list into rows) — a pure CSS media query can't do that.
function columnsForWidth(width: number): number {
  if (width >= 992) return 3;
  if (width >= 768) return 2;
  return 1;
}

function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(() => columnsForWidth(window.innerWidth));

  useEffect(() => {
    // ponytail: plain setTimeout debounce, not a library — a continuous drag-resize would
    // otherwise re-chunk `filtered` into rows on every single resize event.
    let timer: ReturnType<typeof setTimeout>;
    function handleResize() {
      clearTimeout(timer);
      timer = setTimeout(() => setColumns(columnsForWidth(window.innerWidth)), 120);
    }
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return columns;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

// Card footprint/border never move on hover (pass 9) — only the artwork inside zooms.
// The zoom target is `& img`, scoped to ArtworkBlock's <Image>; the card's own `_hover`
// below only ever touches borderColor (the pre-existing score-linked mechanism).
const cardStyle = {
  bg: 'surface.card',
  borderRadius: 'none',
  overflow: 'hidden',
  border: '2px solid',
  borderColor: 'border.ruleStrong',
  css: { '&:hover img': { transform: 'scale(0.97)' } },
};

// Card hover border color is earned the same way the score slab's accent fill is: only
// albums at/above the 8.0 threshold get the ember border on hover, everything else gets
// the neutral bone tone. An album with no score at all (averageScore === null) is treated
// as below threshold — there's nothing to "earn" the accent with.
function cardHoverBorderColor(averageScore: number | null): string {
  return averageScore !== null && averageScore >= SCORE_SLAB_HIGH_THRESHOLD
    ? 'accent.border'
    : 'slab.bg';
}

interface HomeReviewGridProps {
  filtered: AlbumCard[];
  favoritedIds: Set<string>;
  toggleFavorite: (albumId: string) => void;
  // Built by the caller from the actual pipeline inputs (search/sort/source/score), not from
  // `filtered` itself — `filtered` is a new array reference on every App render (it's not
  // memoized), so keying a scroll-reset effect off it directly would fire on every render,
  // including a plain favorite-toggle click.
  resetKey: string;
}

// Real card heights measured live (docs/decisions/home-grid-virtualization.md): ~570-575px
// single-review layout, ~600-630px multi-review layout, consistent across breakpoints since
// card width scales with column count either way. 590 splits the difference; `measureElement`
// (real ResizeObserver, browser-only — ineffective in jsdom) corrects it exactly regardless.
const ESTIMATED_ROW_HEIGHT = 590;
const OVERSCAN_ROWS = 3;

export function HomeReviewGrid({
  filtered,
  favoritedIds,
  toggleFavorite,
  resetKey,
}: HomeReviewGridProps) {
  const columns = useResponsiveColumns();
  const rows = useMemo(() => chunk(filtered, columns), [filtered, columns]);

  // The grid doesn't start at the top of the page (header/controls sit above it), so
  // useWindowVirtualizer needs to know how far down it starts to translate window scroll
  // position into an offset within the row list. Reading `ref.current` during render is
  // disallowed (react-hooks/refs) — measure it in a layout effect instead, before paint,
  // so there's no visible flash between the 0-margin first render and the corrected one.
  const scrollMarginRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(scrollMarginRef.current?.offsetTop ?? 0);
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <Box ref={scrollMarginRef} position="relative" height={rowVirtualizer.getTotalSize()}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        return (
          <Box
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            position="absolute"
            top={0}
            left={0}
            w="100%"
            // pb matches the inner Grid's own gap={2} (Chakra's "2" token, 8px) — the vertical
            // row-to-row gap the old flat SimpleGrid got for free from one shared `gap` prop.
            // Each row is its own absolutely-positioned block now, so nothing else adds space
            // between rows; measureElement picks this up automatically as part of the row's
            // real measured height.
            pb={2}
            transform={`translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`}
          >
            <Grid templateColumns={`repeat(${columns}, 1fr)`} gap={2}>
              {row.map((rev) => {
                // Card rendering branches on review count (see docs/decisions/
                // album-identity-frontend-homepage.md's bugfix note):
                //   0 reviews  -> album-info-only, no card-level link (manually added, not
                //                 yet scraped; ArtworkBlock shows no badges either).
                //   1 review   -> original single-review layout: summary excerpt, one
                //                 review-date line, and the whole card links out to that
                //                 review's url.
                //   2+ reviews -> multi-source layout: per-source <li> lines instead of a
                //                 summary, no card-level link (each line links out on its own).
                const singleReview = rev.reviews.length === 1 ? rev.reviews[0] : null;

                const cardBody = (
                  <Box
                    {...cardStyle}
                    _hover={{ borderColor: cardHoverBorderColor(rev.averageScore) }}
                    h="100%"
                  >
                    <ArtworkBlock
                      rev={rev}
                      isFavorited={favoritedIds.has(rev.albumId)}
                      onToggle={() => toggleFavorite(rev.albumId)}
                    />
                    {/* Title + release date + genre — standardized spacing via AlbumMetaBlock
                        (design-system-audit-2026-08.md, Pass 4). Its own px/py padding replaces
                        this Box's former p={4} for the title/meta portion only; the remaining
                        summary/review-list content below keeps px={4}/pb={4} so its edges still
                        align with AlbumMetaBlock's. Bottom padding tightened to 12px (custom
                        adjustment, review card only) so the gap to the summary text below isn't
                        as wide as the full 20px default. */}
                    <AlbumMetaBlock
                      band={rev.band || 'Unknown Band'}
                      album={rev.album || 'Untitled Album'}
                      releaseDate={rev.releaseDate}
                      genre={rev.genre ?? []}
                      titleLayout="stacked"
                      padding={{ bottom: 3 }}
                    />
                    <Box px={4} pb={4}>
                      {singleReview && (
                        <>
                          {/* lineClamp={3} truncates long summaries with an ellipsis (v3 prop) */}
                          <Text fontSize="m" color="text.dim" lineClamp={3} mb={2}>
                            {singleReview.summary || 'No summary available.'}
                          </Text>
                          {singleReview.publishedDate && (
                            <Text
                              fontFamily="mono"
                              fontSize="11px"
                              letterSpacing="0.06em"
                              color="text.muted"
                              title="Review date"
                            >
                              {singleReview.publishedDate}
                            </Text>
                          )}
                        </>
                      )}
                      {rev.reviews.length > 1 && (
                        <List.Root as="ul" listStyleType="none" ml={0} mb={2}>
                          {rev.reviews.map((r) => (
                            <List.Item key={r.source} fontSize="sm" color="text.dim">
                              {r.source}: {r.score}
                              {r.publishedDate ? ` — ${r.publishedDate}` : ''}{' '}
                              {r.url && (
                                <Link
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  color="accent.start"
                                >
                                  [see review]
                                </Link>
                              )}
                            </List.Item>
                          ))}
                        </List.Root>
                      )}
                    </Box>
                  </Box>
                );

                return singleReview?.url ? (
                  // Exactly one review — the whole card links out to it, same as the
                  // pre-multi-source-display behavior. _hover textDecoration="none" stops
                  // Chakra underlining the card on hover.
                  <Link
                    href={singleReview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={rev.albumId}
                    color="inherit"
                    _hover={{ textDecoration: 'none' }}
                    display="block"
                    onClick={(e: React.MouseEvent) => {
                      // Clicking outside an open Listen menu to dismiss it (see
                      // ArtworkBlock's MenuRoot onOpenChange, which sets this marker on this
                      // very anchor) still lands on this anchor's own click — without this
                      // check that click would also navigate to the review, when the user
                      // only meant to close the menu.
                      const anchor = e.currentTarget as HTMLElement;
                      if (anchor.hasAttribute('data-menu-just-closed')) {
                        anchor.removeAttribute('data-menu-just-closed');
                        e.preventDefault();
                        return;
                      }
                      // The Listen chip is a Menu trigger nested inside this anchor (see
                      // ArtworkBlock) and deliberately doesn't call preventDefault() itself —
                      // doing so there would stop the menu from opening at all. Catching it
                      // here instead, after the trigger's own click handling has already run,
                      // stops this card-level link from following its href when the click
                      // originated on the chip.
                      if ((e.target as HTMLElement).closest('[data-listen-trigger]')) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <Box key={rev.albumId} display="block">
                    {cardBody}
                  </Box>
                );
              })}
            </Grid>
          </Box>
        );
      })}
    </Box>
  );
}

import React from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Text,
  VStack,
  Badge,
  Separator,
} from '@chakra-ui/react';
import { BUTTON_VARIANTS, primaryButton, secondaryButton, sourceBadge, scoreSlabBase, scoreSlabHigh, genreBadge, rankOverlayBadge, cardTitleBand, cardTitleAlbum } from './theme';
import { LoadingIndicator, LoadingIndicatorBars } from './LoadingIndicator';
import { Header } from './Header';
import { Footer } from './Footer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Heading as="h2" size="xl" mb={6} color="text.primary">
        {title}
      </Heading>
      {children}
      <Separator mt={10} borderColor="border.default" />
    </Box>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="xs" color="text.muted" fontFamily="mono" mb={2}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Color swatch
// ---------------------------------------------------------------------------

type SwatchProps = { token: string; description: string; bg: string; textColor?: string };

function Swatch({ token, description, bg, textColor = 'white' }: SwatchProps) {
  return (
    <Box>
      <Box
        bg={bg}
        h="56px"
        borderRadius="md"
        border="1px solid"
        borderColor="border.default"
        mb={2}
      />
      <Text fontSize="xs" fontFamily="mono" color="text.primary" fontWeight="semibold">
        {token}
      </Text>
      <Text fontSize="xs" color="text.muted">
        {description}
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Color groups
// ---------------------------------------------------------------------------

// Descriptions name the real underlying ramp token (ember/ink/sand, pass 1) rather than
// the pre-redesign gray/purple/white values these labels showed before pass 9's audit.
// The old "Badge" group (badge.source/score/genre.* semantic tokens) is gone entirely —
// those tokens are dead: no component reads them anymore. The real badges are documented
// with their actual values in "Badges — Contextual" below.
const COLOR_GROUPS = [
  {
    label: 'Surface',
    swatches: [
      { token: 'surface.page', description: 'Page background (ink.950)', bg: 'surface.page' },
      { token: 'surface.card', description: 'Card background (ink.900)', bg: 'surface.card' },
      { token: 'surface.cardHover', description: 'Card hover background (#181818)', bg: 'surface.cardHover' },
      { token: 'surface.raised', description: 'Raised element (ink.700)', bg: 'surface.raised' },
      { token: 'surface.darkest', description: 'Deepest surface (ink.950)', bg: 'surface.darkest' },
      { token: 'surface.ratingCard', description: 'AlbumRatingPage card border (sand.600)', bg: 'surface.ratingCard' },
      { token: 'surface.ratingCardFill', description: 'AlbumRatingPage card background (sand.900)', bg: 'surface.ratingCardFill' },
      { token: 'surface.criterionRow', description: 'Criteria row resting fill (sand.950)', bg: 'surface.criterionRow' },
      { token: 'surface.criterionHover', description: 'Criteria row hover fill (ink.900)', bg: 'surface.criterionHover' },
      { token: 'surface.criterionActive', description: 'Criteria row + level picker active fill (sand.900)', bg: 'surface.criterionActive' },
    ],
  },
  {
    label: 'Border',
    swatches: [
      { token: 'border.default', description: 'Pre-redesign default border (gray.600) — still used by untouched decorative containers (dialogs, menus)', bg: 'border.default' },
      { token: 'border.hover', description: 'Pre-redesign hover border (gray.400)', bg: 'border.hover' },
      { token: 'border.rule', description: 'Flush-corner badge rule (ink.800)', bg: 'border.rule' },
      { token: 'border.ruleStrong', description: 'Structural 2px rule — cards, form elements, header/footer dividers (ink.700)', bg: 'border.ruleStrong' },
    ],
  },
  {
    label: 'Text',
    swatches: [
      { token: 'text.primary', description: 'Primary text (sand.200)', bg: 'text.primary' },
      { token: 'text.muted', description: 'Muted text (sand.500)', bg: 'text.muted' },
      { token: 'text.dim', description: 'Dim text (sand.300)', bg: 'text.dim' },
    ],
  },
  {
    label: 'Accent',
    swatches: [
      { token: 'accent.start', description: 'Gradient start (ember.300)', bg: 'accent.start' },
      { token: 'accent.end', description: 'Gradient end (ember.600)', bg: 'accent.end' },
      { token: 'accent.border', description: 'Accent border / high-score fill (ember.500)', bg: 'accent.border' },
      { token: 'accent.text', description: 'Accent text (ember.300)', bg: 'accent.text' },
      { token: 'accent.ink', description: 'Dark text for accent-filled backgrounds (#140a03)', bg: 'accent.ink' },
    ],
  },
] as const;

// Slant Take's radii are all zeroed (pass 2) — every corner is square. Shown against a
// mid-tone swatch so the (lack of) corner rounding is actually visible.
const RADIUS_TOKENS = ['none', 'xs', 'sm', 'base', 'md', 'lg', 'full', 'circle'] as const;

// ---------------------------------------------------------------------------
// Typography specimens
// ---------------------------------------------------------------------------

const TYPE_SPECIMENS = [
  { label: 'Heading 3xl', el: 'h1', size: '3xl' },
  { label: 'Heading 2xl', el: 'h2', size: '2xl' },
  { label: 'Heading xl', el: 'h3', size: 'xl' },
  { label: 'Heading lg', el: 'h4', size: 'lg' },
  { label: 'Heading md', el: 'h5', size: 'md' },
] as const;

// ---------------------------------------------------------------------------
// StyleGuide page
// ---------------------------------------------------------------------------

export function StyleGuide() {
  return (
    <Box bg="surface.page" minH="100vh" py={12}>
      <Container maxW="5xl">
        <VStack gap={14} align="stretch">

          {/* Page title */}
          <Box>
            <Heading as="h1" size="3xl" color="text.primary" mb={2}>
              Style Guide
            </Heading>
            <Text color="text.muted">Design tokens, typography, and components.</Text>
          </Box>

          {/* ----------------------------------------------------------------
              COLORS
          ---------------------------------------------------------------- */}
          <Section title="Colors">
            <VStack gap={8} align="stretch">
              {COLOR_GROUPS.map((group) => (
                <Box key={group.label}>
                  <Label>{group.label}</Label>
                  <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap={4}>
                    {group.swatches.map((s) => (
                      <Swatch key={s.token} {...s} />
                    ))}
                  </SimpleGrid>
                </Box>
              ))}
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              TYPOGRAPHY
          ---------------------------------------------------------------- */}
          <Section title="Typography">
            <VStack gap={6} align="stretch">
              {TYPE_SPECIMENS.map(({ label, el, size }) => (
                <Box key={label}>
                  <Label>{label}</Label>
                  <Heading as={el} size={size} color="text.primary">
                    The quick brown fox
                  </Heading>
                </Box>
              ))}

              <Box>
                <Label>Body (md) — text.primary</Label>
                <Text color="text.primary">
                  Reviews pulled from Angry Metal Guy, Metal Storm, and Progressive Subway — normalized to 0–100 and stored in Supabase.
                </Text>
              </Box>
              <Box>
                <Label>Body (md) — text.muted</Label>
                <Text color="text.muted">
                  Reviews pulled from Angry Metal Guy, Metal Storm, and Progressive Subway — normalized to 0–100 and stored in Supabase.
                </Text>
              </Box>
              <Box>
                <Label>Body (md) — text.dim</Label>
                <Text color="text.dim">
                  Reviews pulled from Angry Metal Guy, Metal Storm, and Progressive Subway — normalized to 0–100 and stored in Supabase.
                </Text>
              </Box>
              <Box>
                <Label>Mono / code</Label>
                <Text fontFamily="mono" fontSize="sm" color="text.primary">
                  surface.card → ink.900 → #131313
                </Text>
              </Box>

              {/* Band/album card typography (App.tsx's card body) — fontFamily="body"
                  deliberately, never the heading face: Clash Display is reserved for the
                  wordmark and score-slab number only (see docs/decisions/naming-decisions.md). */}
              <Box>
                <Label>Band — cardTitleBand, lineHeight=1.1</Label>
                <Heading as="h3" {...cardTitleBand} lineHeight="1.1" color="text.primary">
                  Opeth
                </Heading>
              </Box>
              <Box>
                <Label>Album — cardTitleAlbum</Label>
                <Text {...cardTitleAlbum} color="text.primary">
                  Blackwater Park
                </Text>
              </Box>
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              BUTTONS — PRIMARY (ember)
          ---------------------------------------------------------------- */}
          <Section title="Buttons — Primary (ember)">
            <VStack gap={6} align="stretch">
              {/* sizes */}
              <Box>
                <Label>Sizes · variant=solid</Label>
                <HStack gap={3} flexWrap="wrap">
                  {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                    <Box key={size}>
                      <Text fontSize="2xs" color="text.muted" mb={1} textAlign="center" fontFamily="mono">{size}</Text>
                      <Button {...primaryButton} size={size} variant="solid">Label</Button>
                    </Box>
                  ))}
                </HStack>
              </Box>

              {/* all variants */}
              {BUTTON_VARIANTS.map((variant) => (
                <Box key={variant}>
                  <Label>variant={variant}</Label>
                  <HStack gap={3} flexWrap="wrap">
                    <Button {...primaryButton} variant={variant} size="md">Default</Button>
                    <Button {...primaryButton} variant={variant} size="md" disabled>Disabled</Button>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              BUTTONS — SECONDARY (gray)
          ---------------------------------------------------------------- */}
          <Section title="Buttons — Secondary (gray)">
            <VStack gap={6} align="stretch">
              {/* sizes */}
              <Box>
                <Label>Sizes · variant=solid</Label>
                <HStack gap={3} flexWrap="wrap">
                  {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                    <Box key={size}>
                      <Text fontSize="2xs" color="text.muted" mb={1} textAlign="center" fontFamily="mono">{size}</Text>
                      <Button {...secondaryButton} size={size} variant="solid">Label</Button>
                    </Box>
                  ))}
                </HStack>
              </Box>

              {/* all variants */}
              {BUTTON_VARIANTS.map((variant) => (
                <Box key={variant}>
                  <Label>variant={variant}</Label>
                  <HStack gap={3} flexWrap="wrap">
                    <Button {...secondaryButton} variant={variant} size="md">Default</Button>
                    <Button {...secondaryButton} variant={variant} size="md" disabled>Disabled</Button>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              BADGES — CONTEXTUAL
          ---------------------------------------------------------------- */}
          <Section title="Badges — Contextual">
            <VStack gap={6} align="stretch">
              <Box>
                <Label>sourceBadge — review site name, bottom-left of card</Label>
                <HStack gap={2}>
                  <Badge {...sourceBadge}>Angry Metal Guy</Badge>
                  <Badge {...sourceBadge}>Metal Storm</Badge>
                  <Badge {...sourceBadge}>Progressive Subway</Badge>
                </HStack>
              </Box>
              <Box>
                <Label>
                  score slab — normalised score, bottom-right of card. Bone by default;
                  accent-filled only at 8.0+
                </Label>
                <HStack gap={2}>
                  {[
                    { score: '9.0', style: scoreSlabHigh },
                    { score: '8.0', style: scoreSlabHigh },
                    { score: '7.5', style: scoreSlabBase },
                    { score: '6.2', style: scoreSlabBase },
                  ].map(({ score, style }) => (
                    <Box key={score} {...style} display="flex" alignItems="baseline" gap="3px">
                      <Text
                        as="span"
                        fontFamily="heading"
                        fontSize="23px"
                        fontWeight="700"
                        lineHeight="1"
                        letterSpacing="-0.02em"
                      >
                        {score}
                      </Text>
                      <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="700" opacity={0.6}>
                        /10
                      </Text>
                    </Box>
                  ))}
                </HStack>
              </Box>
              <Box>
                <Label>genreBadge — genre tag, inline in card body</Label>
                <HStack gap={2} flexWrap="wrap">
                  <Badge {...genreBadge}>Death Metal</Badge>
                  <Badge {...genreBadge}>Black Metal</Badge>
                  <Badge {...genreBadge}>Progressive Rock</Badge>
                  <Badge {...genreBadge}>Doom</Badge>
                </HStack>
              </Box>
              <Box>
                <Label>rankOverlayBadge — favorites row desktop, flush bottom-left of artwork</Label>
                <HStack gap={2}>
                  <Badge {...rankOverlayBadge}>#1</Badge>
                  <Badge {...rankOverlayBadge}>#2</Badge>
                  <Badge {...rankOverlayBadge}>#3</Badge>
                </HStack>
              </Box>
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              BADGES — SYSTEM
          ---------------------------------------------------------------- */}
          <Section title="Badges — System">
            <HStack gap={3} flexWrap="wrap">
              {(['solid', 'outline', 'surface', 'subtle', 'plain'] as const).map((variant) => (
                <Box key={variant}>
                  <Label>{variant}</Label>
                  <HStack gap={2}>
                    <Badge colorPalette="gray" variant={variant}>Gray</Badge>
                    <Badge colorPalette="green" variant={variant}>Green</Badge>
                    <Badge colorPalette="red" variant={variant}>Red</Badge>
                  </HStack>
                </Box>
              ))}
            </HStack>
          </Section>

          {/* ----------------------------------------------------------------
              RADII — every corner square (pass 2)
          ---------------------------------------------------------------- */}
          <Section title="Radii">
            <HStack gap={4} flexWrap="wrap">
              {RADIUS_TOKENS.map((token) => (
                <Box key={token}>
                  <Label>{token}</Label>
                  <Box bg="surface.raised" borderRadius={token} w="72px" h="72px" />
                </Box>
              ))}
            </HStack>
          </Section>

          {/* ----------------------------------------------------------------
              FORM ELEMENTS — 2px border.ruleStrong, app-wide as of pass 9
          ---------------------------------------------------------------- */}
          <Section title="Form Elements">
            <VStack gap={4} align="stretch" maxW="sm">
              <Box>
                <Label>Input — border=2px solid, borderColor=border.ruleStrong</Label>
                <Input
                  placeholder="e.g. Opeth"
                  bg="surface.card"
                  color="text.primary"
                  border="2px solid"
                  borderColor="border.ruleStrong"
                  _placeholder={{ color: 'text.dim' }}
                />
              </Box>
              <Box>
                <Label>NativeSelect — same border treatment</Label>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    bg="surface.card"
                    color="text.primary"
                    border="2px solid"
                    borderColor="border.ruleStrong"
                    css={{ '& option': { background: 'gray.800' } }}
                    defaultValue="date"
                  >
                    <option value="date">Newest</option>
                    <option value="score">Highest Score</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              LOADING INDICATOR — equalizer bars, both scales (pass 7)
          ---------------------------------------------------------------- */}
          <Section title="Loading Indicator">
            <VStack gap={6} align="stretch">
              <Box>
                <Label>Section scale — 48×64px, text.primary</Label>
                <LoadingIndicator />
              </Box>
              <Box>
                <Label>Button scale — 16×16px, inherits the button's own label color</Label>
                <HStack gap={3} flexWrap="wrap">
                  <Button {...primaryButton} loading spinner={<LoadingIndicatorBars />} aria-label="Loading">
                    Log in
                  </Button>
                  <Button {...secondaryButton} variant="outline" loading spinner={<LoadingIndicatorBars />} aria-label="Loading">
                    Cancel
                  </Button>
                </HStack>
              </Box>
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              HEADER — flat two-tone wordmark (pass 5)
          ---------------------------------------------------------------- */}
          <Section title="Header">
            <Box bg="surface.page" p={4}>
              <Header />
            </Box>
          </Section>

          {/* ----------------------------------------------------------------
              FOOTER — relative "newest review" timestamp + nav links (pass 8)
          ---------------------------------------------------------------- */}
          <Section title="Footer">
            <Box bg="surface.page" p={4}>
              <Footer lastUpdated={new Date().toISOString()} />
            </Box>
          </Section>

        </VStack>
      </Container>
    </Box>
  );
}

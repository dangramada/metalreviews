import React from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  VStack,
  Badge,
  Separator,
} from '@chakra-ui/react';
import { BUTTON_VARIANTS, primaryButton, secondaryButton, sourceBadge, scoreBadge, genreBadge } from './theme';

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

const COLOR_GROUPS = [
  {
    label: 'Surface',
    swatches: [
      { token: 'surface.page', description: 'Page background (gray.900)', bg: 'surface.page' },
      { token: 'surface.card', description: 'Card background (gray.800)', bg: 'surface.card' },
      { token: 'surface.raised', description: 'Raised element (gray.700)', bg: 'surface.raised' },
      { token: 'surface.darkest', description: 'Deepest surface (gray.900)', bg: 'surface.darkest' },
    ],
  },
  {
    label: 'Border',
    swatches: [
      { token: 'border.default', description: 'Default border (gray.600)', bg: 'border.default' },
      { token: 'border.hover', description: 'Hover border (gray.400)', bg: 'border.hover' },
    ],
  },
  {
    label: 'Text',
    swatches: [
      { token: 'text.primary', description: 'Primary text (white)', bg: 'text.primary' },
      { token: 'text.muted', description: 'Muted text (gray.500)', bg: 'text.muted' },
      { token: 'text.dim', description: 'Dim text (gray.400)', bg: 'text.dim' },
    ],
  },
  {
    label: 'Accent',
    swatches: [
      { token: 'accent.start', description: 'Gradient start (purple.300)', bg: 'accent.start' },
      { token: 'accent.end', description: 'Gradient end (purple.600)', bg: 'accent.end' },
      { token: 'accent.border', description: 'Accent border (purple.500)', bg: 'accent.border' },
      { token: 'accent.text', description: 'Accent text (purple.300)', bg: 'accent.text' },
    ],
  },
  {
    label: 'Badge',
    swatches: [
      { token: 'badge.source.bg',   description: 'Source badge bg (gray.800)',      bg: 'badge.source.bg' },
      { token: 'badge.source.text', description: 'Source badge text (purple.100)',   bg: 'badge.source.text' },
      { token: 'badge.score.bg',    description: 'Score badge bg (purple.300)',      bg: 'badge.score.bg' },
      { token: 'badge.score.text',  description: 'Score badge text (#111111)',       bg: 'badge.score.text' },
      { token: 'badge.genre.bg',    description: 'Genre badge bg (whiteAlpha.100)',  bg: 'badge.genre.bg' },
      { token: 'badge.genre.text',  description: 'Genre badge text (purple.200)',    bg: 'badge.genre.text' },
    ],
  },
] as const;

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
                  surface.card → gray.800 → #1a202c
                </Text>
              </Box>
            </VStack>
          </Section>

          {/* ----------------------------------------------------------------
              BUTTONS — PRIMARY (purple)
          ---------------------------------------------------------------- */}
          <Section title="Buttons — Primary (purple)">
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
                <Label>scoreBadge — normalised score, bottom-right of card</Label>
                <HStack gap={2}>
                  <Badge {...scoreBadge}>9.0/10</Badge>
                  <Badge {...scoreBadge}>7.5/10</Badge>
                  <Badge {...scoreBadge}>85/100</Badge>
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

        </VStack>
      </Container>
    </Box>
  );
}

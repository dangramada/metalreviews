// src/components/ListenMenuItems.tsx
//
// Shared Listen-menu body — same 4 platform links/icons/order used by both the review-grid
// card's overlay chip (src/App.tsx) and the Favorites row's footer button (src/FavoritesPage.tsx).
// Renders only the <MenuItem> list; callers own their own MenuRoot/MenuTrigger/MenuContent so
// each can style its trigger differently (overlay chip vs. footer button) without duplicating
// the link-generation logic or platform icon lookup.
import { Link, Text } from '@chakra-ui/react';
import { siBandcamp, siSpotify, siYoutubemusic, siDeezer } from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import { MenuItem } from './ui/menu';
import { PlatformIcon } from './PlatformIcon';
import { LISTEN_PLATFORMS, buildListenUrl, type ListenPlatform } from '../listenLinks';

const LISTEN_PLATFORM_ICONS: Record<ListenPlatform, SimpleIcon> = {
  bandcamp: siBandcamp,
  spotify: siSpotify,
  youtubeMusic: siYoutubemusic,
  deezer: siDeezer,
};

export function ListenMenuItems({ band, album }: { band: string; album: string }) {
  return (
    <>
      {LISTEN_PLATFORMS.map(({ id, label }) => (
        <MenuItem
          key={id}
          value={id}
          asChild
          // Default menu-item cursor token is "default" (an arrow) — these rows are real
          // links. Default highlighted-row bg is too subtle against either caller's panel
          // colour, so whiteAlpha.300 is set explicitly here rather than per-caller.
          cursor="pointer"
          _highlighted={{ bg: 'whiteAlpha.300' }}
        >
          <Link
            href={buildListenUrl(id, band, album)}
            target="_blank"
            rel="noopener noreferrer"
            display="flex"
            alignItems="center"
            gap={2}
            _hover={{ textDecoration: 'none' }}
          >
            <PlatformIcon icon={LISTEN_PLATFORM_ICONS[id]} />
            <Text as="span">{label}</Text>
          </Link>
        </MenuItem>
      ))}
    </>
  );
}

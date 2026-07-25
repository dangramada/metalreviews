import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Flex, Link, Text } from '@chakra-ui/react';

// "Newest review" reflects the newest content actually loaded (max publishedAt across
// albums/reviews), not a "last ingest run" timestamp — no such timestamp is persisted
// anywhere (the old /api/ingest/status endpoint only ever exposed running/idle from an
// in-memory flag, and it was removed along with the refresh button when ingest moved to
// GitHub Actions cron — see docs/decisions/ingest-trigger-and-security.md). Ingest is
// idempotent, so a completed run can add zero new rows; "newest review" is the honest label
// for what this number actually measures — "last updated" would have implied a claim about
// the ingest system this value doesn't make.
function formatRelativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) return 'just now';

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;

  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

interface FooterProps {
  // Newest publishedAt across the currently loaded albums/reviews, ISO string.
  // Undefined when that data isn't available (e.g. not yet loaded).
  lastUpdated?: string;
}

export function Footer({ lastUpdated }: FooterProps) {
  const [now, setNow] = useState(() => Date.now());

  // Recompute relative time periodically so the footer doesn't go stale while the
  // page sits open. 60s is granular enough — this text doesn't need second precision.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const footerTextStyle = {
    fontFamily: 'mono',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'text.muted',
  };

  return (
    <Flex
      as="footer"
      justify="space-between"
      align="center"
      pt={4}
      mt={4}
      borderTop="2px solid"
      borderTopColor="border.ruleStrong"
      {...footerTextStyle}
    >
      <Text {...footerTextStyle}>
        {lastUpdated ? `Newest review: ${formatRelativeTime(lastUpdated, now)}` : ''}
      </Text>
      <Flex align="center" gap={4}>
        <Link as={RouterLink} to="/" {...footerTextStyle} _hover={{ color: 'text.primary' }}>
          Reviews
        </Link>
        <Link
          as={RouterLink}
          to="/favorites"
          {...footerTextStyle}
          _hover={{ color: 'text.primary' }}
        >
          Favorites
        </Link>
        <Text {...footerTextStyle}>&copy; {new Date().getFullYear()} Slant Take</Text>
      </Flex>
    </Flex>
  );
}

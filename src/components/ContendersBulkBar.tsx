import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { secondaryButton } from '../theme';

// The Contenders bulk action bar. Always rendered at >= 768px (hidden below, where selection does
// not exist) at one fixed height, so the first selection no longer pushes the list down: with
// nothing selected the buttons are inert and a status line says what to do.
// Inert via aria-disabled plus an ignored press (not `disabled`), the same busy pattern the rows
// use, so keyboard focus never falls off a button when the selection empties under it.
export const BULK_BAR_HEIGHT = '64px';

interface Props {
  selectedCount: number;
  adding: boolean;
  removing: boolean;
  // A bulk write is in flight: both buttons are really disabled.
  busy: boolean;
  // Readiness for "Select for AOTY" is not known yet: busy look, press ignored and noted.
  unknownBusy: boolean;
  onSelectForAoty: () => void;
  onRemove: () => void;
}

export function ContendersBulkBar({
  selectedCount,
  adding,
  removing,
  busy,
  unknownBusy,
  onSelectForAoty,
  onRemove,
}: Props) {
  const empty = selectedCount === 0;
  const inert = (on: boolean) =>
    on ? ({ opacity: 0.6, cursor: empty ? 'default' : 'progress' } as const) : undefined;
  return (
    <Box h={BULK_BAR_HEIGHT} css={{ '@media (max-width: 47.9375em)': { display: 'none' } }}>
      <Flex
        h="100%"
        align="center"
        justify="space-between"
        px={3}
        border="2px solid"
        borderColor="border.ruleStrong"
        bg="surface.raised"
      >
        <Text fontSize="sm" color={empty ? 'text.muted' : 'text.primary'}>
          {empty ? 'Select albums to add or remove several at once.' : `${selectedCount} selected`}
        </Text>
        <Flex gap={2}>
          <Button
            {...secondaryButton}
            variant="outline"
            size="sm"
            loading={adding}
            disabled={busy}
            aria-busy={(!empty && unknownBusy) || undefined}
            aria-disabled={empty || unknownBusy || undefined}
            css={inert(empty || unknownBusy)}
            onClick={() => {
              if (!empty) onSelectForAoty();
            }}
          >
            Select for AOTY
          </Button>
          <Button
            {...secondaryButton}
            variant="outline"
            size="sm"
            color="text.muted"
            _hover={empty ? undefined : { color: 'red.400' }}
            loading={removing}
            disabled={busy}
            aria-disabled={empty || undefined}
            css={inert(empty)}
            onClick={() => {
              if (!empty) onRemove();
            }}
          >
            Remove
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}

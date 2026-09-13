import { useRef, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, Stack } from '@chakra-ui/react';
import { LuRedo2, LuRotateCcw, LuUndo2 } from 'react-icons/lu';
import { Tooltip } from '../ui/tooltip';
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../ui/dialog';
import { secondaryButton } from '../../theme';

interface ActionRailProps {
  onUndo: () => void;
  onRedo: () => void;
  onRestart: () => void;
  undoDisabled: boolean;
  redoDisabled: boolean;
}

// Replaces HistoryActions' text-only Undo/Redo with icon buttons (react-icons/lu, this
// project's standard icon set — not react-icons/fa, which is reserved for the handful of
// places it's already used) and adds Restart: a full reset (whole answer log cleared, back to
// round 1 degree 2, solver reset from scratch), distinct from Undo both in what it does and in
// requiring confirmation first, since a full reset can wipe a long session in one accidental
// click. The confirm dialog reuses Favorites' remove-confirm pattern verbatim
// (FavoritesPage.tsx's DialogRoot role="alertdialog" + initialFocusEl on the safe action).
//
// Bordered (outline) rather than ghost, at md rather than sm, since 2026-09-12: ghost icons on
// a dark panel read as decoration until hovered, and the design gives each action a visible box.
//
// Vertical, flush against the container's left edge (no left padding) per the brief's layout —
// rendered only alongside the question view, never during a checkpoint, same scoping as
// WorkStatusRow.
//
// 2026-09-13 (mobile): `direction` responsive row→column, one tree, CSS-only — same technique as
// CalibrationPageHeader.tsx's badge-stacking fix. `ActionRail` has exactly one call site
// (CriteriaCalibrationPage.tsx), which repositions the rail's own grid cell from beside the cards
// (desktop) to above them (mobile) — see that file's `gridTemplateAreas` — so making the internal
// stack responsive by default, rather than adding an `orientation` prop, is safe. Tooltip
// `placement="right"` stays fixed for both orientations: the rationale below (avoid covering the
// next button in the stack) is a vertical-desktop concern, and hover tooltips are a secondary,
// non-blocking affordance on touch devices anyway — not worth a second, JS-driven placement path.
export function ActionRail({
  onUndo,
  onRedo,
  onRestart,
  undoDisabled,
  redoDisabled,
}: ActionRailProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRestartRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Stack direction={{ base: 'row', md: 'column' }} gap={2} align="flex-start">
        <RailButton
          label="Undo"
          tooltip={undoDisabled ? 'Nothing to undo yet' : 'Undo your last answer'}
          onClick={onUndo}
          disabled={undoDisabled}
        >
          <LuUndo2 />
        </RailButton>
        <RailButton
          label="Redo"
          tooltip={redoDisabled ? 'Nothing to redo' : 'Redo the answer you undid'}
          onClick={onRedo}
          disabled={redoDisabled}
        >
          <LuRedo2 />
        </RailButton>
        <RailButton
          label="Restart calibration"
          tooltip="Start over from round 1"
          onClick={() => setConfirmOpen(true)}
        >
          <LuRotateCcw />
        </RailButton>
      </Stack>

      <DialogRoot
        open={confirmOpen}
        onOpenChange={({ open }) => setConfirmOpen(open)}
        role="alertdialog"
        initialFocusEl={() => cancelRestartRef.current}
      >
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Restart calibration?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            This clears every answer in this session and starts over from round 1. Undo won&apos;t
            bring it back once you restart — this can&apos;t be undone.
          </DialogBody>
          <DialogFooter gap={3}>
            <Button
              {...secondaryButton}
              variant="solid"
              ref={cancelRestartRef}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              colorPalette="red"
              onClick={() => {
                setConfirmOpen(false);
                onRestart();
              }}
            >
              Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

// One rail button plus its tooltip. Three details are deliberate:
//
//   1. The tooltip wraps a SPAN, not the IconButton. A disabled button receives no pointer
//      events, so a tooltip attached to it directly would go silent exactly when it is most
//      needed — Undo and Redo are disabled for most of a session, and a greyed icon with no
//      explanation is the case that actually needs words. The span still hears the hover.
//      React's onFocus maps to focusin, which bubbles, so an ENABLED button focused by keyboard
//      still opens its tooltip through the same wrapper: one code path for both states.
//   2. The copy is state-aware rather than fixed, because "Undo your last answer" over a button
//      that cannot be pressed explains the icon but not the state the user is looking at.
//   3. Placement right: the rail is a vertical column, so a tooltip above or below would cover
//      the neighbouring button.
//
// `aria-label` stays the button's accessible NAME; Tooltip contributes aria-describedby, so the
// two are additive rather than one overwriting the other.
function RailButton({
  label,
  tooltip,
  onClick,
  disabled,
  children,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={tooltip} positioning={{ placement: 'right' }} openDelay={200}>
      <Box as="span" display="inline-flex">
        <IconButton
          aria-label={label}
          variant="outline"
          {...secondaryButton}
          size="md"
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </IconButton>
      </Box>
    </Tooltip>
  );
}

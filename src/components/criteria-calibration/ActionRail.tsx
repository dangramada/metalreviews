import { useRef, useState } from 'react';
import { Button, IconButton, VStack } from '@chakra-ui/react';
import { LuRedo2, LuRotateCcw, LuUndo2 } from 'react-icons/lu';
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
// Vertical, flush against the container's left edge (no left padding) per the brief's layout —
// rendered only alongside the question view, never during a checkpoint, same scoping as
// WorkStatusRow.
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
      <VStack gap={2} align="flex-start">
        <IconButton
          aria-label="Undo"
          variant="ghost"
          colorPalette="gray"
          size="sm"
          onClick={onUndo}
          disabled={undoDisabled}
        >
          <LuUndo2 />
        </IconButton>
        <IconButton
          aria-label="Redo"
          variant="ghost"
          colorPalette="gray"
          size="sm"
          onClick={onRedo}
          disabled={redoDisabled}
        >
          <LuRedo2 />
        </IconButton>
        <IconButton
          aria-label="Restart calibration"
          variant="ghost"
          colorPalette="gray"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          <LuRotateCcw />
        </IconButton>
      </VStack>

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

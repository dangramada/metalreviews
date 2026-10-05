import { useRef, useState, type FormEvent } from 'react';
import { Button, Text } from '@chakra-ui/react';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from './ui/dialog';
import { ReleaseDateField } from './ReleaseDateField';
import { LoadingIndicatorBars } from '../LoadingIndicator';
import { formatReleaseDate } from '../App';
import { parseReleaseDate } from '../lib/aoty/releaseDate';
import { primaryButton, secondaryButton } from '../theme';

interface ReleaseDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // "Band – Album", for the title.
  albumLabel: string;
  saving: boolean;
  // What the save button does once the date is stored. 'unknown' while the ratings and
  // calibration data are still loading: the button is a neutral busy "Save" and presses are
  // ignored. The parent decides 'ready' / 'not-ready' once and keeps it fixed while the dialog is
  // open, so the button never changes underneath the user.
  readiness: 'unknown' | 'ready' | 'not-ready';
  onSave: (value: string) => void;
  // Where focus goes when the dialog closes without the row having left the view. Explicit
  // because not every browser focuses a button on click (Safari does not), so the dialog's own
  // "return to what was focused" can land on the page body.
  finalFocusEl?: () => HTMLElement | null;
  onExitComplete?: () => void;
}

// Collects the release date for an undated contender. The albums table is a shared catalog and
// the date is fill-once, so the helper text says both. Mounted fresh per album (the parent keys
// it), which is what resets the input.
export function ReleaseDateDialog({
  open,
  onOpenChange,
  albumLabel,
  saving,
  readiness,
  onSave,
  finalFocusEl,
  onExitComplete,
}: ReleaseDateDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const parsed = parseReleaseDate(text);
  const busy = saving || readiness === 'unknown';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || readiness === 'unknown' || !parsed.ok) return;
    onSave(parsed.value);
  }

  return (
    <DialogRoot
      open={open}
      initialFocusEl={() => inputRef.current}
      finalFocusEl={finalFocusEl}
      onExitComplete={onExitComplete}
      // A write in flight keeps the dialog up; closing it would hide the result of an action
      // that is still running.
      onOpenChange={({ open: next }) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Add release date</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={3} color="text.muted" fontSize="sm">
              {albumLabel}
            </Text>
            <ReleaseDateField
              value={text}
              onChange={setText}
              inputRef={inputRef}
              helperText="Shared with everyone who has this album and cannot be changed afterwards from the app."
            />
            {readiness === 'not-ready' && (
              <Text mt={3} fontSize="sm" color="text.muted">
                This album also needs a rating and a settled score level before it can be selected.
              </Text>
            )}
            {parsed.ok && (
              <Text mt={3} fontSize="sm" color="text.muted" aria-live="polite">
                Will be saved as: {formatReleaseDate(parsed.value)}
              </Text>
            )}
          </DialogBody>
          <DialogFooter gap={3}>
            <Button
              {...secondaryButton}
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              {...primaryButton}
              type="submit"
              disabled={!parsed.ok}
              // Busy without `disabled` so a second Enter or click lands on the guard, not nowhere.
              aria-busy={busy || undefined}
              aria-disabled={busy || undefined}
              css={busy ? { opacity: 0.6, cursor: 'progress' } : undefined}
            >
              {busy && <LoadingIndicatorBars />}
              {readiness === 'ready'
                ? 'Save and select for AOTY'
                : readiness === 'unknown'
                  ? 'Save'
                  : 'Save date'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

import { useEffect, useRef, useState } from 'react';

// Tracks in-flight Supabase writes so a refresh/tab-close mid-write can warn the user
// instead of silently dropping the row. A real refresh-during-insert on
// CriteriaCalibrationPage was traced to a displayed-accuracy regression (see
// docs/decisions/criteria-calibration/criteria-calibration-reload-glitch-and-sluggishness-fix.md): the insert's
// fetch gets aborted by navigation (no keepalive flag), the answer never reaches the DB, and
// the next reload deterministically recomputes accuracy from one fewer answer.
//
// Deliberately NOT "await the write before allowing the next interaction" — that only
// narrows the race window (a hard refresh isn't blocked by an in-flight promise either way)
// while adding a network round-trip of latency to every interaction. A beforeunload guard
// instead makes the in-flight state visible and gives the browser's native "leave site?"
// prompt a chance to let the write finish, with no added latency on the happy path.
export function usePendingWritesGuard() {
  const pendingCountRef = useRef(0);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  function beginWrite() {
    pendingCountRef.current++;
    setHasPendingWrites(true);
  }

  function endWrite() {
    pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
    if (pendingCountRef.current === 0) setHasPendingWrites(false);
  }

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingCountRef.current === 0) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { beginWrite, endWrite, hasPendingWrites };
}

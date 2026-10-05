import { useEffect, useState } from 'react';

// Busy only shows once the wait has lasted this long (or the user pressed during it), so a quick
// load never flashes a busy state.
const BUSY_DELAY_MS = 150;

// "Is Select for AOTY readiness known yet?" `loading` is the combined loading flag of the data
// that decides it (ratings summary, calibration gate). Known is sticky: it turns true the first
// time loading ends and stays true through later refetches, so a background refresh never flips
// readiness back to unknown. It resets when `key` (the user id) changes.
//
// A hook that never reported loading (as in tests that stub it as false) is known from the start.
// After a key change the hooks restart one render late, so known only returns once loading has
// been seen true and then false again.
export function useReadinessKnown(loading: boolean, key: string | null) {
  const [s, setS] = useState({ key, done: !loading, saw: loading, early: false });
  const [delayed, setDelayed] = useState(false);

  if (s.key !== key) setS({ key, done: false, saw: false, early: false });
  else if (!s.done) {
    if (loading && !s.saw) setS({ ...s, saw: true });
    else if (!loading && s.saw) setS({ ...s, done: true });
  }
  const known = s.key === key && s.done;

  useEffect(() => {
    if (known) return;
    const t = setTimeout(() => setDelayed(true), BUSY_DELAY_MS);
    return () => clearTimeout(t);
  }, [known]);

  return {
    known,
    // Visible busy state: after the delay, or at once if the user already pressed something.
    busyVisible: !known && (delayed || s.early),
    // Call when a press is ignored because readiness is unknown, so the feedback shows now.
    notePress: () => setS((p) => ({ ...p, early: true })),
  };
}

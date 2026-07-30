import { useEffect, useState } from 'react';

// JS-side counterpart to the `_motionReduce` CSS prop used elsewhere (e.g.
// LoadingIndicator's equalizer bars). That pattern is enough for pure-CSS
// animations, but the Criteria Calibration fade is orchestrated with
// setTimeout (hold delay, then fade-out/fade-in), so the delays themselves
// need to be skipped in JS, not just the CSS transition.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduced(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}

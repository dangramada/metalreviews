import { useCallback, useEffect, useRef, useState } from 'react';

// Delays before retry 1 and retry 2; length is also the max retry count.
// CAA redirects to archive.org, which returns intermittent 5xx for some images — a
// short wait usually clears it, but onError can't tell that from a permanent 404.
export const IMAGE_RETRY_DELAYS_MS = [3000, 8000];

// Retries a failed <img> load a bounded number of times. The caller remounts the
// <img> with key={attempt} so each retry is a real new request, and keeps it hidden
// until `loaded`. `failed` only flips after the last retry.
export function useImageRetry(url: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Reset when the card is handed a different artwork (state adjusted during render,
  // per React docs); the effect below clears any pending retry for the old url.
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setAttempt(0);
    setLoaded(false);
    setFailed(false);
  }
  useEffect(() => () => clearTimeout(timer.current), [url]);

  const onError = useCallback(() => {
    if (attempt < IMAGE_RETRY_DELAYS_MS.length) {
      timer.current = setTimeout(() => setAttempt((a) => a + 1), IMAGE_RETRY_DELAYS_MS[attempt]);
    } else {
      setFailed(true);
    }
  }, [attempt]);

  const onLoad = useCallback(() => setLoaded(true), []);

  return { attempt, loaded, failed, onError, onLoad };
}

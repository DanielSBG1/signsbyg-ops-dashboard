import { useEffect, useRef } from 'react';

/**
 * Like setInterval, but pauses when the tab is hidden.
 * Resumes with an immediate tick when the tab becomes visible again
 * (if enough time has elapsed since the last tick).
 *
 * @param {Function} callback - function to call on each tick
 * @param {number} delayMs - interval in milliseconds
 * @param {boolean} enabled - set false to disable entirely
 */
export default function useVisibleInterval(callback, delayMs, enabled = true) {
  const savedCallback = useRef(callback);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !delayMs) return;

    let id;

    function tick() {
      lastTickRef.current = Date.now();
      savedCallback.current();
    }

    function startInterval() {
      clearInterval(id);
      id = setInterval(tick, delayMs);
    }

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(id);
      } else {
        // Tab became visible — fire immediately if overdue
        const elapsed = Date.now() - lastTickRef.current;
        if (elapsed >= delayMs) tick();
        startInterval();
      }
    }

    startInterval();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [delayMs, enabled]);
}

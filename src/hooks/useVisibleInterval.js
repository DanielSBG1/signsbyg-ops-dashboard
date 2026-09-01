import { useEffect, useRef } from 'react';

const IDLE_THRESHOLD_MS = 120_000; // 2 minutes

/**
 * Like setInterval, but pauses when the tab is hidden.
 * Resumes with an immediate tick when the tab becomes visible again
 * (if enough time has elapsed since the last tick).
 *
 * Also slows to 5× the normal delay when the user has been idle for
 * IDLE_THRESHOLD_MS (2 min) but the tab is still visible. Reverts to
 * the normal delay as soon as any interaction is detected, firing an
 * immediate tick if overdue.
 *
 * @param {Function} callback - function to call on each tick
 * @param {number} delayMs - interval in milliseconds (active, non-idle)
 * @param {boolean} enabled - set false to disable entirely
 */
export default function useVisibleInterval(callback, delayMs, enabled = true) {
  const savedCallback = useRef(callback);
  const lastTickRef = useRef(Date.now());
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !delayMs) return;

    let id;

    function isIdle() {
      return Date.now() - lastInteractionRef.current >= IDLE_THRESHOLD_MS;
    }

    function effectiveDelay() {
      return isIdle() ? delayMs * 5 : delayMs;
    }

    function tick() {
      lastTickRef.current = Date.now();
      savedCallback.current();
    }

    function startInterval() {
      clearInterval(id);
      id = setInterval(tick, effectiveDelay());
    }

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(id);
      } else {
        // Tab became visible — fire immediately if overdue
        const elapsed = Date.now() - lastTickRef.current;
        if (elapsed >= effectiveDelay()) tick();
        startInterval();
      }
    }

    function handleInteraction() {
      const wasIdle = isIdle();
      lastInteractionRef.current = Date.now();

      if (wasIdle && !document.hidden) {
        // User came back from idle — restart at the faster cadence,
        // firing immediately if overdue relative to normal delay.
        clearInterval(id);
        const elapsed = Date.now() - lastTickRef.current;
        if (elapsed >= delayMs) tick();
        startInterval();
      }
    }

    startInterval();
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('mousemove', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('mousemove', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [delayMs, enabled]);
}

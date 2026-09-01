import { useState, useEffect } from 'react';
import { idbClearAll } from '../lib/idbCache.js';

export default function useMemoryMonitor() {
  const [isHighMemory, setIsHighMemory] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    // Chrome-only: performance.memory
    if (!performance.memory) return;

    const CHECK_INTERVAL = 60_000; // 1 minute
    const HIGH_THRESHOLD = 500 * 1024 * 1024; // 500MB
    const WARN_THRESHOLD = 800 * 1024 * 1024; // 800MB

    const check = () => {
      const used = performance.memory.usedJSHeapSize;
      setIsHighMemory(used > HIGH_THRESHOLD);
      if (used > WARN_THRESHOLD) {
        setShowWarning(true);
        // Auto-clear old cache to free memory
        idbClearAll().catch(() => {});
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const dismiss = () => setShowWarning(false);

  return { isHighMemory, showWarning, dismiss };
}

import { useState, useEffect } from 'react';

/**
 * Hook to detect when a loading state exceeds a certain threshold (default: 3500ms)
 */
export function useSlowLoading(isLoading: boolean, delayMs = 3500): boolean {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsSlow(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, delayMs]);

  return isSlow;
}

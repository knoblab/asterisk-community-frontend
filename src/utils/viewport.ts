/**
 * Viewport height utility to handle mobile & tablet dynamic toolbars
 * (Safari address bar, Chrome omnibox, virtual keyboards, in-app browser chrome)
 * by continuously syncing the true visible height to the CSS variable `--app-height`.
 */

export function updateAppViewportHeight(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Prefer visualViewport.height if available (gives exact visible height excluding browser chrome & virtual keyboard)
  // Fall back to window.innerHeight
  const visibleHeight = window.visualViewport?.height ?? window.innerHeight;

  if (visibleHeight > 0) {
    document.documentElement.style.setProperty('--app-height', `${visibleHeight}px`);
  }
}

export function initViewportHeightListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  updateAppViewportHeight();

  const handleResize = () => {
    updateAppViewportHeight();
  };

  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('orientationchange', handleResize, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport.addEventListener('scroll', handleResize, { passive: true });
  }

  return () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
    }
  };
}

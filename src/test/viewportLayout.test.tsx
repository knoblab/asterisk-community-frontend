import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { updateAppViewportHeight, initViewportHeightListener } from '../utils/viewport';
import { Dashboard } from '../pages/Dashboard';

describe('Viewport & Layout Responsiveness', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--app-height');
    document.body.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. updateAppViewportHeight: sets --app-height based on window.innerHeight or visualViewport', () => {
    // Mock window.innerHeight
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 740 });

    updateAppViewportHeight();
    expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('740px');

    // With visualViewport available
    const mockVisualViewport = {
      height: 610,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockVisualViewport,
    });

    updateAppViewportHeight();
    expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('610px');
  });

  it('2. initViewportHeightListener: listens to resize, visualViewport resize and cleans up listeners', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const mockVisualViewport = {
      height: 650,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockVisualViewport,
    });

    const cleanup = initViewportHeightListener();

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
    expect(addEventListenerSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function), { passive: true });
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });

    cleanup();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function));
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('3. Dashboard: adds body.shell-no-scroll-active on home landing view and cleans up on unmount', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <Dashboard />
      </MemoryRouter>
    );

    // Initial state on '/' is home (main tab, feed view)
    expect(document.body.classList.contains('shell-no-scroll-active')).toBe(true);

    unmount();
    expect(document.body.classList.contains('shell-no-scroll-active')).toBe(false);
  });
});

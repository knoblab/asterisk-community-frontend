import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore';

describe('SSO Authentication Logic (Knoblab Auth Integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, loading: false, _authInitialized: false });
  });

  it('generates the correct cross-domain SSO login URL with /api/auth-callback and service=asterisk parameter', () => {
    const locationMock = {
      href: 'https://cnsh.space/community',
      origin: 'https://cnsh.space',
      pathname: '/community',
      search: '',
    };
    
    vi.spyOn(window, 'location', 'get').mockReturnValue(locationMock as unknown as Location);

    useAuthStore.getState().login();
    const redirectedUrl = new URL(locationMock.href);
    
    expect(redirectedUrl.origin).toBe('https://login.knoblab.xyz');
    expect(redirectedUrl.searchParams.get('service')).toBe('asterisk');
    expect(redirectedUrl.searchParams.get('redirect')).toBe(
      'https://cnsh.space/api/auth-callback?returnTo=%2Fcommunity'
    );
  });

  it('handles successful checkAuth from /api/me', async () => {
    const mockUser = {
      authenticated: true,
      uid: 'user-sso-1234',
      email: 'cnsh32_1218@g.cnees.kr',
      emailVerified: true,
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUser),
        } as Response);
      }
      if (url.includes('/users/profile')) {
        return Promise.resolve({
          ok: false,
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const user = await useAuthStore.getState().checkAuth();

    expect(user).toBeTruthy();
    expect(user?.uid).toBe('user-sso-1234');
    expect(user?.email).toBe('cnsh32_1218@g.cnees.kr');
    expect(useAuthStore.getState().user?.uid).toBe('user-sso-1234');
  });

  it('rejects unauthorized external email and clears session on checkAuth', async () => {
    const mockUser = {
      authenticated: true,
      uid: 'unauthorized-uid-9999',
      email: 'attacker@external-domain.com',
      emailVerified: true,
    };

    const clearSessionSpy = vi.fn();
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUser),
        } as Response);
      }
      if (url.includes('/api/clear-session')) {
        clearSessionSpy(url, init);
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const user = await useAuthStore.getState().checkAuth();

    expect(user).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(clearSessionSpy).toHaveBeenCalledTimes(1);
    expect(clearSessionSpy.mock.calls[0][1]?.credentials).toBe('include');
  });

  it('calls local /api/logout and central clear-session with credentials: include on logout', async () => {
    useAuthStore.setState({
      user: {
        uid: 'test-uid',
        email: 'cnsh32_1218@g.cnees.kr',
        displayName: '테스트',
        photoURL: null,
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true } as Response);
    globalThis.fetch = fetchSpy;

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.knoblab.xyz/api/clear-session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
  });
});

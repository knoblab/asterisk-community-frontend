import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from '../components/dashboard/SettingsModal';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import * as boardStore from '../stores/useBoardStore';

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    vi.spyOn(boardStore, 'authFetch').mockResolvedValue(
      new Response(JSON.stringify({ connected: true, email: 'student@cnsh.hs.kr', requiresScopeUpgrade: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    useAuthStore.setState({
      user: {
        uid: 'user-1',
        email: 'student@cnsh.hs.kr',
        displayName: '테스트유저',
        photoURL: null,
        agreedTerms: true,
        agreedPrivacy: true,
        agreedAt: Date.UTC(2026, 10, 13),
        schoolGrade: '3',
        schoolClass: '2',
      },
      loading: false,
      logout: vi.fn(),
      updateUserProfile: vi.fn().mockResolvedValue(undefined),
      updateTermsAgreement: vi.fn().mockResolvedValue(undefined),
      uploadProfileImage: vi.fn().mockResolvedValue('https://example.com/avatar.png'),
    });

    useUIStore.setState({
      theme: 'light',
      toggleTheme: vi.fn(),
      addToast: vi.fn(),
    });
  });

  it('omits school class settings from General tab and renders them in Profile tab', async () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.queryByText(/학교 학급 설정/i)).toBeNull();
    expect(screen.queryByLabelText('학년')).toBeNull();
    expect(screen.queryByLabelText('반')).toBeNull();
    expect(screen.getByText('3학년 2반')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: '프로필 관리' }));

    expect(screen.getByLabelText('학년')).toBeDefined();
    expect(screen.getByLabelText('반')).toBeDefined();
  });

  it('renders a segmented theme toggle without emojis and toggles only on inactive option click', () => {
    const toggleTheme = vi.fn();
    useUIStore.setState({ theme: 'light', toggleTheme });

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    const lightBtn = screen.getByRole('button', { name: '라이트' });
    const darkBtn = screen.getByRole('button', { name: '다크' });

    expect(lightBtn.getAttribute('aria-pressed')).toBe('true');
    expect(darkBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(lightBtn);
    expect(toggleTheme).not.toHaveBeenCalled();

    fireEvent.click(darkBtn);
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('renders Terms & Google status badges cleanly and handles Escape close', async () => {
    const onClose = vi.fn();
    render(<SettingsModal isOpen={true} onClose={onClose} />);

    expect(screen.getByText('전체 필수 동의 완료')).toBeDefined();
    expect(screen.getByRole('link', { name: '이용약관' })).toBeDefined();
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toBeDefined();
    expect(screen.getByRole('button', { name: '동의 해제하기' })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('연동됨')).toBeDefined();
    });
    expect(screen.getAllByText('student@cnsh.hs.kr').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '연동 해제' })).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders scope-upgrade warning state for Google Classroom', async () => {
    vi.spyOn(boardStore, 'authFetch').mockResolvedValue(
      new Response(
        JSON.stringify({ connected: true, email: 'student@cnsh.hs.kr', requiresScopeUpgrade: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('권한 업데이트 필요')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: '권한 업데이트' })).toBeDefined();
  });
});

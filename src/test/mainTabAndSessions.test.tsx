import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from '../pages/Dashboard';
import { MainLandingPage } from '../components/home/MainLandingPage';
import { MyActivityPage } from '../components/dashboard/MyActivityPage';
import { useUIStore } from '../stores/useUIStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';

describe('Main Tab & Asterisk AI Sessions Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores
    useUIStore.setState({
      mobileTab: 'main',
      mainChatSessionId: null,
      theme: 'light',
      toasts: [],
      isLoginModalOpen: false,
    });

    useAuthStore.setState({
      user: {
        uid: 'test-user-uid',
        email: 'user@cnsh.space',
        displayName: '테스트사용자',
        photoURL: null,
      } as any,
      loading: false,
    });

    useBoardStore.setState({
      posts: [],
      isLoading: false,
    });

    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, _options?: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/api/posts')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }

      if (urlStr.includes('/api/comments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }

      if (urlStr.includes('/api/ai/chat/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ remainingSeconds: 0, isCooldown: false }),
        });
      }

      if (urlStr.includes('/api/ai/sessions/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sessionId: 'session_123',
              title: '오늘 급식 식단 문의',
              createdAt: Date.now() - 60000,
              updatedAt: Date.now() - 60000,
              messages: [
                {
                  id: 'msg-1',
                  role: 'user',
                  content: '오늘 급식 뭐야?',
                  createdAt: Date.now() - 60000,
                },
                {
                  id: 'msg-2',
                  role: 'assistant',
                  content: '오늘 점심 메뉴는 돈까스입니다.',
                  createdAt: Date.now() - 50000,
                },
              ],
            }),
        });
      }

      if (urlStr.includes('/api/ai/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                sessionId: 'session_123',
                title: '오늘 급식 식단 문의',
                messageCount: 2,
                createdAt: Date.now() - 60000,
                updatedAt: Date.now() - 60000,
                lastMessage: '오늘 점심 메뉴는...',
              },
            ]),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any);
  });

  it('1. Header desktop & drawer: removes "Asterisk AI *" tab and places "메인" tab as the first item', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    // Desktop nav buttons
    const mainTabBtns = screen.getAllByRole('button', { name: '메인' });
    expect(mainTabBtns.length).toBeGreaterThan(0);

    // Verify "Asterisk AI *" tab is NOT in header navigation
    const aiNavTabs = screen.queryAllByRole('button', { name: /asterisk AI \*/i });
    expect(aiNavTabs.length).toBe(0);

    // Verify Board and Popular tabs follow
    expect(screen.getAllByRole('button', { name: '게시판' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '인기글' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '내 활동' }).length).toBeGreaterThan(0);
  });

  it('2. MainLandingPage: renders landing view with input, monochrome prompt chips, and safe privacy text', () => {
    render(<MainLandingPage />);

    // Brand headline
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText(/The Answer to Campus Life, and Everything/i)).toBeInTheDocument();

    // Input prompt box
    const textarea = screen.getByPlaceholderText(/asterisk AI에게 무엇이든 물어보세요/i);
    expect(textarea).toBeInTheDocument();

    // Monochrome quick chips
    expect(screen.getByText('오늘 급식 식단')).toBeInTheDocument();
    expect(screen.getByText('커뮤니티 인기글 요약')).toBeInTheDocument();
    expect(screen.getByText('주요 공지사항 요약')).toBeInTheDocument();
    expect(screen.getByText('내가 쓴 글 목록 요약')).toBeInTheDocument();

    // Privacy notice
    expect(
      screen.getByText(/Asterisk AI와 나눈 대화 내역은 안전을 위해 저장되지만, AI 학습이나 개인정보를 이용하는데 사용되지 않습니다/i)
    ).toBeInTheDocument();

    // Suspicious text must NOT be present
    expect(screen.queryByText(/관리자 탭에는 노출되지 않습니다/i)).not.toBeInTheDocument();
  });

  it('3. MyActivityPage: renders "AI 대화 기록" tab and loads saved session', async () => {
    render(<MyActivityPage onPostClick={vi.fn()} />);

    // Check tab existence
    const aiChatTabBtn = screen.getByRole('button', { name: /AI 대화 기록/i });
    expect(aiChatTabBtn).toBeInTheDocument();

    // Click AI 대화 기록 tab
    fireEvent.click(aiChatTabBtn);

    // Should fetch and display the session from mock
    await waitFor(() => {
      expect(screen.getByText('오늘 급식 식단 문의')).toBeInTheDocument();
    });

    expect(screen.getByText(/메시지 2개/i)).toBeInTheDocument();

    // Click "이어하기" button
    const continueBtn = screen.getByTitle('이어서 대화하기');
    fireEvent.click(continueBtn);

    // Should set mobileTab to 'main' and set mainChatSessionId
    expect(useUIStore.getState().mobileTab).toBe('main');
    expect(useUIStore.getState().mainChatSessionId).toBe('session_123');
  });

  it('4. MainLandingPage: automatically loads session history when mainChatSessionId is set (이어하기)', async () => {
    useUIStore.setState({
      mainChatSessionId: 'session_123',
    });

    render(<MainLandingPage />);

    // Should load and display the existing session title and message stream
    await waitFor(() => {
      expect(screen.getByText('오늘 급식 식단 문의')).toBeInTheDocument();
      expect(screen.getByText('오늘 급식 뭐야?')).toBeInTheDocument();
      expect(screen.getByText('오늘 점심 메뉴는 돈까스입니다.')).toBeInTheDocument();
    });

    expect(screen.getByText('새 대화')).toBeInTheDocument();
  });
});

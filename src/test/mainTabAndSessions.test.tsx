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

  it('1. Header desktop & drawer: removes "Asterisk AI *" tab and places "홈" tab as the first item', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    // Desktop nav buttons
    const homeTabBtns = screen.getAllByRole('button', { name: '홈' });
    expect(homeTabBtns.length).toBeGreaterThan(0);

    // Verify "Asterisk AI *" tab is NOT in header navigation
    const aiNavTabs = screen.queryAllByRole('button', { name: /asterisk AI \*/i });
    expect(aiNavTabs.length).toBe(0);

    // Verify Board and Popular tabs follow
    expect(screen.getAllByRole('button', { name: '게시판' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '인기글' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '내 활동' }).length).toBeGreaterThan(0);
  }, 15000);

  it('2. MainLandingPage: renders landing view with "The answer of campus..." input, command guide icon, and safe privacy text', () => {
    render(<MainLandingPage />);

    // Brand headline
    expect(screen.getByText('AI')).toBeInTheDocument();

    // Input prompt box with new placeholder
    const textarea = screen.getByPlaceholderText('The answer of campus...');
    expect(textarea).toBeInTheDocument();

    // Old quick chips must be REMOVED
    expect(screen.queryByText('오늘 급식 식단')).not.toBeInTheDocument();
    expect(screen.queryByText('커뮤니티 인기글 요약')).not.toBeInTheDocument();
    expect(screen.queryByText('주요 공지사항 요약')).not.toBeInTheDocument();
    expect(screen.queryByText('내가 쓴 글 목록 요약')).not.toBeInTheDocument();

    // Guide info button must be present
    expect(screen.getAllByRole('button', { name: '명령어 가이드' }).length).toBeGreaterThan(0);

    // Guide tooltip title, tool filter buttons
    expect(screen.getByText('사용 가능한 도구')).toBeInTheDocument();
    expect(screen.getByText(/전체 12/)).toBeInTheDocument();

    // All 12 tools must be present with tags and examples
    expect(screen.getByText('급식 조회')).toBeInTheDocument();
    expect(screen.getByText('시간표 조회')).toBeInTheDocument();
    expect(screen.getByText('학사일정')).toBeInTheDocument();
    expect(screen.getByText('클래스룸 과제')).toBeInTheDocument();
    expect(screen.getByText('캘린더 일정')).toBeInTheDocument();
    expect(screen.getByText('구글 태스크')).toBeInTheDocument();
    expect(screen.getByText('커뮤니티 요약')).toBeInTheDocument();
    expect(screen.getByText('내 활동 요약')).toBeInTheDocument();
    expect(screen.getByText('선배 노하우')).toBeInTheDocument();
    expect(screen.getByText('이미지 분석')).toBeInTheDocument();
    expect(screen.getAllByText(/학술검색/).length).toBeGreaterThan(0);
    expect(screen.getByText('시각 · D-Day')).toBeInTheDocument();

    // Clicking 학사일정 tool example fills the calendar-compatible prompt
    const academicCalBtn = screen.getByText('학사일정').closest('button');
    expect(academicCalBtn).toBeInTheDocument();
    fireEvent.click(academicCalBtn!);
    expect(textarea).toHaveValue('이번 학기 1회 지필고사 일정 확인하고 캘린더에 등록해줘');

    // Clicking a tool example fills the textarea
    const calendarToolBtn = screen.getByText('캘린더 일정').closest('button');
    expect(calendarToolBtn).toBeInTheDocument();
    fireEvent.click(calendarToolBtn!);
    expect(textarea).toHaveValue('내일 오후 3시 모둠 연구 회의 캘린더에 등록해줘');

    // Guide tooltip link to asterisk.knoblab.xyz/ai
    const guideLinks = screen.getAllByRole('link', { name: /asterisk ai가 무엇인가요\?/i });
    expect(guideLinks.length).toBeGreaterThan(0);
    expect(guideLinks[0]).toHaveAttribute('href', 'https://asterisk.knoblab.xyz/ai');
    expect(guideLinks[0]).toHaveAttribute('target', '_blank');

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

  it('5. MainLandingPage: smooth drawer accordion toggles with (i) button and shrinks on tool selection without auto-send', () => {
    useUIStore.setState({
      mainChatSessionId: null,
    });

    render(<MainLandingPage />);
    const textarea = screen.getByPlaceholderText('The answer of campus...');
    const guideBtn = screen.getByRole('button', { name: '명령어 가이드' });
    const drawer = document.querySelector('.ai-guide-expand-drawer');

    expect(drawer).not.toHaveClass('open');

    // Click (i) button to open drawer downwards
    fireEvent.click(guideBtn);
    expect(drawer).toHaveClass('open');

    // Click a tool chip
    const timetableChip = screen.getByText('시간표 조회').closest('button');
    expect(timetableChip).toBeInTheDocument();
    fireEvent.click(timetableChip!);

    // Should fill textarea with example and close drawer
    expect(textarea).toHaveValue('오늘 1학년 2반 시간표와 수업 시간 알려줘');
    expect(drawer).not.toHaveClass('open');

    // Re-clicking (i) toggles it open and closed
    fireEvent.click(guideBtn);
    expect(drawer).toHaveClass('open');
    fireEvent.click(guideBtn);
    expect(drawer).not.toHaveClass('open');
  });
});

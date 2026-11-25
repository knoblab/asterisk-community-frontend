import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../pages/Dashboard';
import { CreatePostPage } from '../components/community/CreatePostPage';
import { PostDetail } from '../components/community/PostDetail';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';
import { useNotificationStore } from '../stores/useNotificationStore';
import { isSafeReturnPath } from '../utils/fileSecurity';
import {
  DAEPAE_PLAY_URL,
  hasDaepaePlayLink,
  parseWriteDraftFromSearch,
} from '../utils/shareDraft';

describe('daepae -> asterisk* score sharing flow', () => {
  const validUser = {
    uid: 'student-1',
    email: 'cnsh33_0101@cnsh.hs.kr',
    displayName: '홍길동',
    photoURL: null,
    agreedTerms: true,
    agreedPrivacy: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: validUser,
      loading: false,
      _authInitialized: true,
    });
    useBoardStore.setState({
      posts: [],
      totalPosts: 0,
      isLoading: false,
      fetchPosts: vi.fn().mockResolvedValue(undefined),
      fetchPostById: vi.fn().mockResolvedValue(null),
      addPost: vi.fn().mockResolvedValue(true),
      incrementViews: vi.fn(),
      comments: [],
      fetchComments: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({
      mobileTab: 'main',
      toasts: [],
      isLoginModalOpen: false,
      loginModalMessage: '',
      isSettingsModalOpen: false,
      isTermsModalOpen: false,
    });
    useNotificationStore.setState({
      unreadCount: 0,
      startPolling: vi.fn(() => () => {}),
    });
  });

  describe('parseWriteDraftFromSearch & returnTo safety', () => {
    it('parses structured daepae share parameters into a prefilled draft with play link', () => {
      const params = new URLSearchParams({
        share: 'daepae',
        class: '1학년 2반',
        player: '수박장인',
        score: '3450',
        best: '5120',
        rank: '2',
        classScore: '98200',
        fruit: '🍉',
      });

      const search = `?${params.toString()}`;
      expect(isSafeReturnPath(`/write${search}`)).toBe(true);

      const draft = parseWriteDraftFromSearch(search);
      expect(draft).not.toBeNull();
      expect(draft?.source).toBe('daepae');
      expect(draft?.category).toBe('잡담');
      expect(draft?.title).toContain('1학년 2반 수박장인');
      expect(draft?.title).toContain('3,450 pt');
      expect(draft?.body).toContain('이번 판 점수: **3,450 pt**');
      expect(draft?.body).toContain('내 최고 기록: **5,120 pt**');
      expect(draft?.body).toContain('우리 반 주간 순위: **2위** (98,200 pt)');
      expect(draft?.body).toContain(`[충수박 플레이하러 가기](${DAEPAE_PLAY_URL})`);
      expect(draft?.scoreCard).toEqual({
        classLabel: '1학년 2반',
        playerName: '수박장인',
        runScore: 3450,
        bestSingle: 5120,
        clsRank: '2',
        clsWeeklyScore: 98200,
        topFruitEmoji: '🍉',
      });
    });

    it('uses best record phrasing when current run score is 0', () => {
      const draft = parseWriteDraftFromSearch(
        '?share=daepae&class=2%ED%95%99%EB%85%84+1%EB%B0%98&player=%EA%B2%8C%EC%8A%A4%ED%8A%B8&score=0&best=4200&rank=-&classScore=12000&fruit=%F0%9F%8D%87'
      );
      expect(draft?.title).toContain('최고 기록 4,200 pt 공유!');
      expect(draft?.body).not.toContain('이번 판 점수');
      expect(draft?.body).toContain('내 최고 기록: **4,200 pt**');
      expect(draft?.scoreCard?.topFruitEmoji).toBe('🍇');
    });

    it('sanitizes control/bidi characters, invalid numbers, ranks, and disallowed emojis', () => {
      const draft = parseWriteDraftFromSearch(
        '?share=daepae&class=%E2%80%AE1%EB%B0%98%0A%3Cscript%3E&player=*evil*&score=-50&best=notanumber&rank=999&classScore=999999999999&fruit=%F0%9F%92%A9'
      );
      expect(draft).not.toBeNull();
      expect(draft?.scoreCard?.classLabel).not.toContain('\u202e');
      expect(draft?.scoreCard?.classLabel).not.toContain('\n');
      expect(draft?.scoreCard?.runScore).toBe(0);
      expect(draft?.scoreCard?.bestSingle).toBe(0);
      expect(draft?.scoreCard?.clsRank).toBe('-');
      expect(draft?.scoreCard?.clsWeeklyScore).toBe(999_999_999);
      expect(draft?.scoreCard?.topFruitEmoji).toBe('🍉');
      expect(draft?.body).toContain('\\*evil\\*');
    });
  });

  describe('Dashboard /write deep-link & navigation', () => {
    it('opens CreatePostPage directly with prefilled score when logged in at /write?share=daepae', async () => {
      const query =
        '/write?share=daepae&class=1%ED%95%99%EB%85%84+3%EB%B0%98&player=%EC%B6%A9%EC%88%98%EB%B0%95%EC%99%95&score=2800&best=3100&rank=1&classScore=55000&fruit=%F0%9F%8D%89';

      render(
        <MemoryRouter initialEntries={[query]}>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeInTheDocument();
      });

      const titleInput = screen.getByPlaceholderText('제목을 입력하세요') as HTMLInputElement;
      const bodyTextarea = screen.getByPlaceholderText(/GitHub 마크다운/i) as HTMLTextAreaElement;

      expect(titleInput.value).toContain('1학년 3반 충수박왕');
      expect(titleInput.value).toContain('2,800 pt');
      expect(bodyTextarea.value).toContain(DAEPAE_PLAY_URL);
      expect(screen.getByLabelText('점수 카드 이미지 함께 첨부')).toBeChecked();

      const chungsubakLinks = screen.getAllByRole('link', { name: /충수박/ });
      expect(chungsubakLinks.some((a) => a.getAttribute('href') === DAEPAE_PLAY_URL)).toBe(true);
    });

    it('shows login modal on /write?share=daepae when logged out without wiping the write view', async () => {
      useAuthStore.setState({ user: null, loading: false });

      render(
        <MemoryRouter initialEntries={['/write?share=daepae&class=1%ED%95%99%EB%85%84+1%EB%B0%98&player=%ED%85%8C%EC%8A%A4%ED%84%B0&score=1000&best=1000&rank=3&classScore=5000&fruit=%F0%9F%8D%89']}>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('충수박 점수를 공유하려면 로그인이 필요합니다.')).toBeInTheDocument();
      });
    });
  });

  describe('CreatePostPage score card attachment on submit', () => {
    it('submits text-only draft when score card attachment is unchecked', async () => {
      const mockAddPost = vi.fn().mockResolvedValue(true);
      const mockUpload = vi.fn();
      useBoardStore.setState({ addPost: mockAddPost });
      useAuthStore.setState({ uploadAttachment: mockUpload });

      const draft = parseWriteDraftFromSearch(
        '?share=daepae&class=1%ED%95%99%EB%85%84+1%EB%B0%98&player=%ED%85%8C%EC%8A%A4%ED%84%B0&score=1500&best=2000&rank=4&classScore=30000&fruit=%F0%9F%8D%89'
      )!;

      const onBack = vi.fn();
      render(<CreatePostPage onBack={onBack} initialDraft={draft} />);

      const checkbox = screen.getByLabelText('점수 카드 이미지 함께 첨부');
      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: '작성 완료' }));

      await waitFor(() => {
        expect(mockAddPost).toHaveBeenCalledTimes(1);
      });
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockAddPost.mock.calls[0][0].body).toContain(DAEPAE_PLAY_URL);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('uploads rendered score card image and prepends markdown image when checked', async () => {
      const mockAddPost = vi.fn().mockResolvedValue(true);
      const mockUpload = vi.fn().mockResolvedValue({
        url: '/api/uploads/images/chungsubak_card.png',
        filename: 'chungsubak_card.png',
        originalName: 'chungsubak_score.png',
        fileType: 'image',
        mimeType: 'image/png',
        size: 1234,
      });
      useBoardStore.setState({ addPost: mockAddPost });
      useAuthStore.setState({ uploadAttachment: mockUpload });

      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
        cb(new Blob(['fake-png'], { type: 'image/png' }));
      });

      const draft = parseWriteDraftFromSearch(
        '?share=daepae&class=1%ED%95%99%EB%85%84+1%EB%B0%98&player=%ED%85%8C%EC%8A%A4%ED%84%B0&score=1500&best=2000&rank=4&classScore=30000&fruit=%F0%9F%8D%89'
      )!;

      render(<CreatePostPage onBack={vi.fn()} initialDraft={draft} />);
      fireEvent.click(screen.getByRole('button', { name: '작성 완료' }));

      await waitFor(() => {
        expect(mockUpload).toHaveBeenCalledTimes(1);
        expect(mockAddPost).toHaveBeenCalledTimes(1);
      });

      const submittedBody = mockAddPost.mock.calls[0][0].body as string;
      expect(submittedBody.startsWith('![충수박 점수 카드](/api/uploads/images/chungsubak_card.png)')).toBe(true);
      expect(submittedBody).toContain(DAEPAE_PLAY_URL);
    });
  });

  describe('PostDetail Chungsubak CTA banner', () => {
    it('renders "충수박 플레이하러 가기" CTA banner on posts containing daepae.pages.dev link', () => {
      expect(hasDaepaePlayLink('점수 공유 https://daepae.pages.dev/')).toBe(true);
      expect(hasDaepaePlayLink('일반 게시글 내용입니다')).toBe(false);

      useBoardStore.setState({
        posts: [
          {
            id: 'post-daepae-1',
            category: '잡담',
            title: '🍉 [충수박] 1학년 1반 홍길동 — 3,000 pt 기록 공유!',
            body: `> 🍉 **충수박 점수 공유**\n> 🍉 **[충수박 플레이하러 가기](${DAEPAE_PLAY_URL})**`,
            author: '홍길동',
            authorId: 'student-1',
            createdAt: Date.now(),
            views: 1,
            likes: 0,
            commentCount: 0,
          },
        ],
      });

      render(
        <MemoryRouter>
          <PostDetail postId="post-daepae-1" onBack={vi.fn()} />
        </MemoryRouter>
      );

      const ctaLinks = screen.getAllByRole('link', { name: /충수박 플레이하러 가기/ });
      expect(ctaLinks.length).toBeGreaterThanOrEqual(2);
      expect(ctaLinks.every((el) => el.getAttribute('href') === DAEPAE_PLAY_URL)).toBe(true);
    });

    it('does not render Chungsubak CTA banner on normal posts', () => {
      useBoardStore.setState({
        posts: [
          {
            id: 'post-normal-1',
            category: '잡담',
            title: '일반 게시글',
            body: '오늘 급식 맛있네요',
            author: '홍길동',
            authorId: 'student-1',
            createdAt: Date.now(),
            views: 1,
            likes: 0,
            commentCount: 0,
          },
        ],
      });

      render(
        <MemoryRouter>
          <PostDetail postId="post-normal-1" onBack={vi.fn()} />
        </MemoryRouter>
      );

      expect(screen.queryByRole('link', { name: /충수박 플레이하러 가기/ })).toBeNull();
    });
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImageViewerPage, getSafeImageViewerSrc } from '../pages/ImageViewerPage';
import { Dashboard, sanitizeEmailParam } from '../pages/Dashboard';
import { ToastContainer } from '../components/ToastContainer';
import { MainLandingPage, sanitizeDaseinSearchResults } from '../components/home/MainLandingPage';
import { validateDirectAiImageFile } from '../utils/fileSecurity';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';

describe('P1 Security Fixes: Auth, State, Pages, & Toast/Landing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    useAuthStore.setState({
      user: null,
      loading: false,
      _authInitialized: false,
    });

    useBoardStore.setState({
      posts: [],
      comments: [],
      totalPosts: 0,
      currentPage: 1,
      isLoading: false,
      aiGeneratingParentId: null,
    });

    useUIStore.setState({
      mobileTab: 'main',
      toasts: [],
      isLoginModalOpen: false,
      isSettingsModalOpen: false,
      isTermsModalOpen: false,
      mainChatSessionId: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. [M-22 / #12-1] ImageViewerPage URL Allowlist, Referrer Policy & Error Suppression', () => {
    it('restricts getSafeImageViewerSrc to same-origin upload paths and allowlisted https hosts only', () => {
      expect(getSafeImageViewerSrc('/api/uploads/images/photo.png')).toBe('/api/uploads/images/photo.png');
      expect(getSafeImageViewerSrc('/uploads/images/photo.webp')).toBe('/uploads/images/photo.webp');
      expect(getSafeImageViewerSrc('https://cnsh.space/media/test.jpg')).toBe('https://cnsh.space/media/test.jpg');
      expect(getSafeImageViewerSrc('https://cdn.qpi.digital/img.jpg')).toBe('https://cdn.qpi.digital/img.jpg');

      // Reject blob:, arbitrary external https:, http:, javascript:, credentials, and traversal
      expect(getSafeImageViewerSrc('blob:https://cnsh.space/1234-5678')).toBe('');
      expect(getSafeImageViewerSrc('https://evil.example.com/tracker.png')).toBe('');
      expect(getSafeImageViewerSrc('http://cnsh.space/media/test.jpg')).toBe('');
      expect(getSafeImageViewerSrc('https://user:pass@cnsh.space/media/test.jpg')).toBe('');
      expect(getSafeImageViewerSrc('javascript:alert(1)')).toBe('');
      expect(getSafeImageViewerSrc('//evil.example.com/x.png')).toBe('');
    });

    it('renders img with referrerPolicy="no-referrer" and suppresses external link and download on error or rejected src', () => {
      // Rejected external src -> no img, no external link, no download button
      const { unmount } = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/image/evil.png?src=https%3A%2F%2Fevil.com%2Fevil.png'] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: '/image/:filename',
              element: React.createElement(ImageViewerPage),
            })
          )
        )
      );

      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByTitle('원본 파일 다운로드')).toBeNull();
      unmount();

      // Valid src -> img has referrerPolicy="no-referrer", then onError suppresses download & external link
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/image/photo.png?src=%2Fapi%2Fuploads%2Fimages%2Fphoto.png'] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: '/image/:filename',
              element: React.createElement(ImageViewerPage),
            })
          )
        )
      );

      const img = screen.getByAltText('photo.png');
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(screen.getByTitle('원본 파일 다운로드')).toBeTruthy();
      expect(screen.getByTitle('새 탭에서 직접 열기')).toBeTruthy();

      fireEvent.error(img);

      expect(screen.queryByTitle('원본 파일 다운로드')).toBeNull();
      expect(screen.queryByTitle('새 탭에서 직접 열기')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    });
  });

  describe('2. [M-23 / #12-2] Dashboard Query Param Sanitization & ToastContainer Linkification', () => {
    it('sanitizeEmailParam accepts valid emails and rejects URLs or phishing text', () => {
      expect(sanitizeEmailParam('cnsh32_1234@g.cnees.kr')).toBe('cnsh32_1234@g.cnees.kr');
      expect(sanitizeEmailParam('https://evil.com/phish')).toBe('알 수 없음');
      expect(sanitizeEmailParam('click http://evil.com')).toBe('알 수 없음');
      expect(sanitizeEmailParam('')).toBe('알 수 없음');
      expect(sanitizeEmailParam(null)).toBe('알 수 없음');
    });

    it('Dashboard sanitizes expected and actual query params on google_error=email_mismatch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

      render(
        React.createElement(
          MemoryRouter,
          {
            initialEntries: [
              '/?google_error=email_mismatch&expected=https://evil.com/login&actual=cnsh32_1234@g.cnees.kr',
            ],
          },
          React.createElement(Dashboard)
        )
      );

      await waitFor(() => {
        const toasts = useUIStore.getState().toasts;
        expect(toasts.length).toBeGreaterThan(0);
        const msg = toasts[0].message;
        expect(msg).not.toContain('https://evil.com');
        expect(msg).toContain('알 수 없음');
        expect(msg).toContain('cnsh32_1234@g.cnees.kr');
      });
    });

    it('ToastContainer does NOT auto-linkify arbitrary http/https URLs while keeping status.knoblab.xyz allowlisted', () => {
      useUIStore.setState({
        toasts: [
          {
            id: 't-evil',
            type: 'error',
            message: '확인: https://evil.com/phish 또는 http://bad.example.com',
          },
          {
            id: 't-status',
            type: 'error',
            message: '서버 통신 실패. status.knoblab.xyz에서 확인하세요.',
          },
        ],
      });

      render(React.createElement(ToastContainer));

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe('https://status.knoblab.xyz');
      expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
      expect(screen.getByText(/https:\/\/evil\.com\/phish/)).toBeTruthy();
    });

    it('Dashboard PWA authorize fallback rejects unsafe data.url redirects', async () => {
      const replaceMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        href: 'https://cnsh.space/api/integrations/google/authorize',
        origin: 'https://cnsh.space',
        pathname: '/api/integrations/google/authorize',
        search: '',
        replace: replaceMock,
      } as unknown as Location);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes('/api/integrations/google/authorize')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ url: 'https://evil.com/steal-oauth' }),
            });
          }
          return Promise.resolve({ ok: true, json: async () => [] });
        })
      );

      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/api/integrations/google/authorize'] },
          React.createElement(Dashboard)
        )
      );

      await waitFor(() => {
        const toasts = useUIStore.getState().toasts;
        expect(toasts.some((t) => t.type === 'error')).toBe(true);
      });
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('3. [M-24 / #12-3] Terms Agreement Integrity, Session Cleanup & safeReturnPath', () => {
    it('checkAuth ignores tampered localStorage consent flags and treats backend profile booleans as authoritative', async () => {
      localStorage.setItem(
        'Knoblab-user-profile-uid-1',
        JSON.stringify({ agreedTerms: true, agreedPrivacy: true, agreedAt: 12345 })
      );

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('/api/me')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                authenticated: true,
                uid: 'uid-1',
                email: 'cnsh32_1001@g.cnees.kr',
              }),
            } as Response);
          }
          if (url.includes('/api/users/profile')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                displayName: '학생',
                agreedTerms: false,
                agreedPrivacy: false,
              }),
            } as Response);
          }
          return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
        })
      );

      const user = await useAuthStore.getState().checkAuth();
      expect(user?.agreedTerms).toBe(false);
      expect(user?.agreedPrivacy).toBe(false);

      // Even if /api/users/profile fails or omits fields, tampered localStorage must NOT grant consent
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('/api/me')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                authenticated: true,
                uid: 'uid-1',
                email: 'cnsh32_1001@g.cnees.kr',
              }),
            } as Response);
          }
          return Promise.resolve({ ok: false, status: 500 } as Response);
        })
      );

      const userOffline = await useAuthStore.getState().checkAuth();
      expect(userOffline?.agreedTerms).toBe(false);
      expect(userOffline?.agreedPrivacy).toBe(false);
    });

    it('updateTermsAgreement reverts/does not persist consent on backend failure and throws', async () => {
      useAuthStore.setState({
        user: {
          uid: 'uid-2',
          email: 'cnsh32_1002@g.cnees.kr',
          displayName: '학생2',
          photoURL: null,
          agreedTerms: false,
          agreedPrivacy: false,
          agreedAt: null,
        },
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'DB Error' }),
        })
      );

      await expect(useAuthStore.getState().updateTermsAgreement(true, true)).rejects.toThrow();

      const after = useAuthStore.getState().user;
      expect(after?.agreedTerms).toBe(false);
      expect(after?.agreedPrivacy).toBe(false);
      expect(localStorage.getItem('asterisk_agreed_terms')).toBeNull();
      expect(localStorage.getItem('asterisk_agreed_privacy')).toBeNull();
    });

    it('logout and handleSessionExpired clear asterisk_agreed_*, Knoblab-comment-parents-*, class, and mainChatSessionId', async () => {
      const seedStorage = () => {
        localStorage.setItem('asterisk_agreed_terms', 'true');
        localStorage.setItem('asterisk_agreed_privacy', 'true');
        localStorage.setItem('asterisk_agreed_at', '1000');
        localStorage.setItem('Knoblab-comment-parents-post-1', '{"c1":"p1"}');
        localStorage.setItem('class', '{"g":"1","c":"2"}');
        localStorage.setItem('asterisk_ai_chat_uid', '[]');
        localStorage.setItem('Knoblab-user-profile-uid', '{}');
        useUIStore.getState().setMainChatSessionId('session_abc');
      };

      seedStorage();
      useAuthStore.setState({
        user: { uid: 'uid', email: 'cnsh32_1001@g.cnees.kr', displayName: 'A', photoURL: null },
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await useAuthStore.getState().logout();

      expect(localStorage.getItem('asterisk_agreed_terms')).toBeNull();
      expect(localStorage.getItem('asterisk_agreed_privacy')).toBeNull();
      expect(localStorage.getItem('asterisk_agreed_at')).toBeNull();
      expect(localStorage.getItem('Knoblab-comment-parents-post-1')).toBeNull();
      expect(localStorage.getItem('class')).toBeNull();
      expect(useUIStore.getState().mainChatSessionId).toBeNull();

      seedStorage();
      useAuthStore.getState().handleSessionExpired();

      expect(localStorage.getItem('asterisk_agreed_terms')).toBeNull();
      expect(localStorage.getItem('Knoblab-comment-parents-post-1')).toBeNull();
      expect(localStorage.getItem('class')).toBeNull();
      expect(useUIStore.getState().mainChatSessionId).toBeNull();
    });

    it('login sanitizes safeReturnPath against backslash bypasses', () => {
      const locationMock = {
        href: 'https://cnsh.space/\\evil.com',
        origin: 'https://cnsh.space',
        pathname: '/\\evil.com',
        search: '',
      };
      vi.spyOn(window, 'location', 'get').mockReturnValue(locationMock as unknown as Location);

      useAuthStore.getState().login();
      const redirectedUrl = new URL(locationMock.href);
      expect(redirectedUrl.searchParams.get('redirect')).toBe('https://cnsh.space/api/auth-callback');
    });

    it('MainLandingPage blocks AI send and opens TermsAgreementModal when agreedTerms/agreedPrivacy is false', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchSpy);

      useAuthStore.setState({
        user: {
          uid: 'uid-no-terms',
          email: 'cnsh32_1234@g.cnees.kr',
          displayName: '미동의',
          photoURL: null,
          agreedTerms: false,
          agreedPrivacy: false,
        },
        loading: false,
      });

      render(React.createElement(MainLandingPage));

      const textarea = screen.getByPlaceholderText('The answer of campus...');
      fireEvent.change(textarea, { target: { value: '오늘 급식 알려줘' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(useUIStore.getState().isTermsModalOpen).toBe(true);
      const aiCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('/api/ai/chat') && !String(u).includes('/status'));
      expect(aiCalls).toHaveLength(0);
    });
  });

  describe('4. [M-25 / #12-5b] Board Store [REPLY_TO:] Spoofing, JSON.parse Safety & URL Encoding', () => {
    it('fetchComments ignores forged [REPLY_TO:] prefix in body and relies on structured parentId', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [
            {
              id: 'c-forged',
              postId: 'post/1',
              parentId: null,
              body: '[REPLY_TO:victim-parent]\n위장 대댓글',
              author: '공격자',
              authorId: 'u-1',
              createdAt: 1000,
              likes: 0,
            },
            {
              id: 'c-valid',
              postId: 'post/1',
              parentId: 'real-parent',
              body: '[REPLY_TO:forged-other]\n정상 대댓글',
              author: '사용자',
              authorId: 'u-2',
              createdAt: 2000,
              likes: 0,
            },
          ],
        })
      );

      await useBoardStore.getState().fetchComments('post/1');

      const comments = useBoardStore.getState().comments;
      expect(comments).toHaveLength(2);
      expect(comments[0].parentId).toBeUndefined();
      expect(comments[0].body).toBe('위장 대댓글');
      expect(comments[1].parentId).toBe('real-parent');
      expect(comments[1].body).toBe('정상 대댓글');
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('postId=post%2F1'));
    });

    it('addComment sends structured parentId without [REPLY_TO:] prefix and handles malformed localStorage gracefully', async () => {
      localStorage.setItem('Knoblab-comment-parents-post-1', '{invalid-json');
      useAuthStore.setState({
        user: { uid: 'u-1', email: 'cnsh32_1001@g.cnees.kr', displayName: '작성자', photoURL: null },
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'c-new',
          postId: 'post-1',
          parentId: 'parent-1',
          body: '정상 본문',
          author: '작성자',
          authorId: 'u-1',
          createdAt: 1000,
          likes: 0,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const ok = await useBoardStore.getState().addComment({
        postId: 'post-1',
        parentId: 'parent-1',
        author: '작성자',
        authorId: 'u-1',
        body: '[REPLY_TO:hijack-id]\n정상 본문',
      });

      expect(ok).toBe(true);
      const sentBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}'));
      expect(sentBody.parentId).toBe('parent-1');
      expect(sentBody.body).toBe('정상 본문');
      expect(useBoardStore.getState().comments[0].parentId).toBe('parent-1');
    });

    it('encodes dynamic IDs in fetchPostById and updateComment', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'id?x=1', body: '수정됨', postId: 'p1', author: 'a', authorId: 'u', createdAt: 1, likes: 0 }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await useBoardStore.getState().fetchPostById('id?x=1');
      expect(fetchMock).toHaveBeenCalledWith('/api/posts/id%3Fx%3D1');

      await useBoardStore.getState().updateComment('c/1?a=b', { body: '[REPLY_TO:evil]\n수정됨' });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/comments/c%2F1%3Fa%3Db',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ body: '수정됨' }),
        })
      );
    });
  });

  describe('5. [M-5 / #12-9] MainLandingPage daseinSearchResults & Safe Error Rendering', () => {
    it('sanitizeDaseinSearchResults keeps https URLs only, bounds lengths, and drops unsafe schemes', () => {
      const longTitle = 'A'.repeat(250);
      const longSnippet = 'B'.repeat(600);
      const result = sanitizeDaseinSearchResults([
        { title: longTitle, snippet: longSnippet, url: 'https://arxiv.org/abs/2401.00001' },
        { title: 'HTTP link', snippet: 'bad', url: 'http://arxiv.org/abs/1' },
        { title: 'JS link', snippet: 'bad', url: 'javascript:alert(1)' },
        { title: 'Cred link', snippet: 'bad', url: 'https://user:pass@example.com' },
        { title: 'Google Custom Search Engine', snippet: 'noise', url: 'https://google.com' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://arxiv.org/abs/2401.00001');
      expect(result[0].title.length).toBe(200);
      expect(result[0].snippet.length).toBe(500);
    });

    it('MainLandingPage does not pass raw err.message into MarkdownRenderer on AI error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes('/api/ai/chat/status')) {
            return Promise.resolve({ ok: true, json: async () => ({ remainingSeconds: 0 }) });
          }
          if (String(url).includes('/api/ai/chat')) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: 'Click [here](https://evil.com/phish) now!' }),
            });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        })
      );

      useAuthStore.setState({
        user: {
          uid: 'uid-agreed',
          email: 'cnsh32_1234@g.cnees.kr',
          displayName: '동의유저',
          photoURL: null,
          agreedTerms: true,
          agreedPrivacy: true,
        },
        loading: false,
      });

      render(React.createElement(MainLandingPage));

      const textarea = screen.getByPlaceholderText('The answer of campus...');
      fireEvent.change(textarea, { target: { value: '안녕' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(screen.getByText(/답변을 불러오지 못했습니다\./)).toBeTruthy();
      });

      expect(screen.queryByText(/evil\.com/)).toBeNull();
      expect(screen.queryByRole('link', { name: 'here' })).toBeNull();
    });

    it('MainLandingPage rejects SVG and non-raster image MIMEs while accepting valid raster images', async () => {
      expect(
        validateDirectAiImageFile({ name: 'evil.svg', size: 128, type: 'image/svg+xml' }).valid
      ).toBe(false);
      expect(
        validateDirectAiImageFile({ name: 'photo.bmp', size: 128, type: 'image/bmp' }).valid
      ).toBe(false);
      expect(
        validateDirectAiImageFile({ name: 'photo.png', size: 128, type: 'image/png' }).valid
      ).toBe(true);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

      const { container } = render(React.createElement(MainLandingPage));
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.getAttribute('accept')).not.toContain('image/*');
      expect(fileInput.getAttribute('accept')).toContain('image/png');

      // Reject image/svg+xml
      const svgFile = new File(['<svg onload="alert(1)"></svg>'], 'evil.svg', { type: 'image/svg+xml' });
      fireEvent.change(fileInput, { target: { files: [svgFile] } });

      await waitFor(() => {
        const toasts = useUIStore.getState().toasts;
        expect(toasts.some((t) => t.type === 'error')).toBe(true);
      });
      expect(container.querySelector('.ai-attached-thumb-img')).toBeNull();

      // Reject spoofed MIME whose FileReader data URL is SVG
      const origFileReader = globalThis.FileReader;
      class MockSvgFileReader {
        result: string | ArrayBuffer | null = null;
        onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
        readAsDataURL() {
          this.result = 'data:image/svg+xml;base64,PHN2Zz4=';
          this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
        }
      }
      vi.stubGlobal('FileReader', MockSvgFileReader);
      useUIStore.setState({ toasts: [] });

      const spoofedFile = new File(['<svg></svg>'], 'spoof.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [spoofedFile] } });

      await waitFor(() => {
        const toasts = useUIStore.getState().toasts;
        expect(toasts.some((t) => t.type === 'error')).toBe(true);
      });
      expect(container.querySelector('.ai-attached-thumb-img')).toBeNull();

      vi.stubGlobal('FileReader', origFileReader);
    });

    it('MainLandingPage returns [] immediately for @dasein search when Google CSE is absent (no 6.4s delay)', async () => {
      delete (window as any).google;

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/api/ai/chat/status')) {
          return Promise.resolve({ ok: true, json: async () => ({ remainingSeconds: 0 }) });
        }
        if (String(url).includes('/api/ai/chat')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              sessionId: 'sess-dasein-1',
              text: '검색 완료',
              model: 'gemini-2.5-flash',
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      vi.stubGlobal('fetch', fetchSpy);

      useAuthStore.setState({
        user: {
          uid: 'uid-dasein',
          email: 'cnsh32_1234@g.cnees.kr',
          displayName: '검색유저',
          photoURL: null,
          agreedTerms: true,
          agreedPrivacy: true,
        },
        loading: false,
      });

      const start = Date.now();
      render(React.createElement(MainLandingPage));

      const textarea = screen.getByPlaceholderText('The answer of campus...');
      fireEvent.change(textarea, { target: { value: '@dasein quantum coherence research' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(
        () => {
          const chatCalls = fetchSpy.mock.calls.filter(
            ([u]) => String(u).includes('/api/ai/chat') && !String(u).includes('/status')
          );
          expect(chatCalls).toHaveLength(1);
          const sentPayload = JSON.parse(String(chatCalls[0][1]?.body || '{}'));
          expect(sentPayload.daseinSearchResults).toEqual([]);
        },
        { timeout: 1000 }
      );
      expect(Date.now() - start).toBeLessThan(1500);
    });

    it('MainLandingPage enables allowActionCards on assistant messages while blocking action:// cards on user messages', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes('/api/ai/sessions/sess-action-1')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                title: '액션 테스트',
                messages: [
                  {
                    id: 'u-1',
                    role: 'user',
                    content: '[사용자 주입](action://calendar-delete?eventId=u1&summary=UserInjected)',
                    createdAt: 1000,
                  },
                  {
                    id: 'a-1',
                    role: 'assistant',
                    content: '[일정 추가](action://calendar-add?summary=HomeAiSuggested&start=2026-11-09T09:00:00%2B09:00)',
                    createdAt: 2000,
                  },
                ],
              }),
            });
          }
          return Promise.resolve({ ok: true, json: async () => ({ remainingSeconds: 0 }) });
        })
      );

      useAuthStore.setState({
        user: {
          uid: 'uid-action',
          email: 'cnsh32_1234@g.cnees.kr',
          displayName: '유저',
          photoURL: null,
          agreedTerms: true,
          agreedPrivacy: true,
        },
        loading: false,
      });
      useUIStore.setState({ mainChatSessionId: 'sess-action-1' });

      const { container } = render(React.createElement(MainLandingPage));

      await waitFor(() => {
        expect(screen.getByText('HomeAiSuggested')).toBeTruthy();
      });

      expect(container.querySelector('[data-testid="calendar-delete-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="calendar-approval-card"]')).toBeTruthy();
    });
  });
});

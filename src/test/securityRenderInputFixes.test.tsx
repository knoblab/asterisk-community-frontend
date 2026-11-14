import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MarkdownRenderer,
  isSafeGoogleAuthorizeRedirect,
} from '../components/MarkdownRenderer';
import {
  validateUploadFile,
  hasDangerousIntermediateExt,
  escapeMarkdownLabel,
  escapeMarkdownUrl,
} from '../utils/fileSecurity';
import { AsteriskAiPage, parseStoredAiMessages } from '../components/ai/AsteriskAiPage';
import { CommentSection } from '../components/community/CommentSection';
import { PostDetail } from '../components/community/PostDetail';
import { useAuthStore } from '../stores/useAuthStore';
import { useBoardStore } from '../stores/useBoardStore';
import { useUIStore } from '../stores/useUIStore';

describe('Security Render & Input Fixes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    useAuthStore.setState({
      user: {
        uid: 'user-sec-1',
        email: 'student@g.cnees.kr',
        displayName: '테스트유저',
        photoURL: 'https://example.com/avatar.png',
      },
      loading: false,
    });

    useBoardStore.setState({
      posts: [],
      comments: [],
      aiGeneratingParentId: null,
    });

    useUIStore.setState({
      toasts: [],
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. [H-4] action:// Cards Gating (allowActionCards)', () => {
    const allActionLinks = [
      '[일정 등록](action://calendar-add?summary=EvilEvent&start=2026-11-09T09:00:00%2B09:00)',
      '[일정 수정](action://calendar-update?eventId=e1&summary=EvilUpdate&start=2026-11-09T09:00:00%2B09:00)',
      '[일정 삭제](action://calendar-delete?eventId=e1&summary=EvilDelete)',
      '[할 일](action://task-add?title=EvilTask)',
    ].join('\n\n');

    it('blocks all action:// cards by default (allowActionCards=false)', () => {
      const { container } = render(<MarkdownRenderer content={allActionLinks} />);

      expect(container.querySelector('[data-testid="calendar-approval-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="calendar-update-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="calendar-delete-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="task-approval-card"]')).toBeNull();
      expect(container.querySelector('a[href^="action://"]')).toBeNull();
    });

    it('renders action:// cards only when allowActionCards={true}', () => {
      const { container } = render(<MarkdownRenderer content={allActionLinks} allowActionCards />);

      expect(container.querySelector('[data-testid="calendar-approval-card"]')).toBeInTheDocument();
      expect(container.querySelector('[data-testid="calendar-update-card"]')).toBeInTheDocument();
      expect(container.querySelector('[data-testid="calendar-delete-card"]')).toBeInTheDocument();
      expect(container.querySelector('[data-testid="task-approval-card"]')).toBeInTheDocument();
    });

    it('blocks action:// cards inside PostDetail and CommentSection', () => {
      const maliciousPost = {
        id: '1234567',
        category: '잡담' as const,
        title: '공격 테스트 게시글',
        body: '[무료 상품 받기](action://calendar-delete?eventId=evt_1&summary=ImportantEvent)',
        author: '공격자',
        authorId: 'attacker-1',
        createdAt: Date.now(),
        views: 1,
        likes: 0,
        commentCount: 1,
      };
      useBoardStore.setState({
        posts: [maliciousPost],
        comments: [
          {
            id: 'c-1',
            postId: '1234567',
            author: '공격자',
            authorId: 'attacker-1',
            body: '[클릭하세요](action://calendar-add?summary=SpamEvent&start=2026-11-09T09:00:00%2B09:00)',
            createdAt: Date.now(),
            likes: 0,
          },
        ],
        incrementViews: vi.fn(),
        fetchComments: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { container } = render(
        <MemoryRouter>
          <PostDetail postId="1234567" onBack={vi.fn()} />
          <CommentSection postId="1234567" />
        </MemoryRouter>
      );

      expect(screen.getByText('무료 상품 받기')).toBeInTheDocument();
      expect(screen.getAllByText('클릭하세요').length).toBeGreaterThanOrEqual(1);
      expect(container.querySelector('[data-testid="calendar-delete-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="calendar-approval-card"]')).toBeNull();
    });

    it('enables action:// cards on AsteriskAiPage assistant messages but never on user messages', () => {
      const storageKey = 'asterisk_ai_chat_user-sec-1';
      localStorage.setItem(
        storageKey,
        JSON.stringify([
          {
            id: 'msg-user-1',
            role: 'user',
            content: '[사용자 주입](action://calendar-delete?eventId=u1&summary=UserInjected)',
            createdAt: 1000,
          },
          {
            id: 'msg-bot-1',
            role: 'assistant',
            content: '[일정 추가](action://calendar-add?summary=AiSuggested&start=2026-11-09T09:00:00%2B09:00)',
            createdAt: 2000,
          },
        ])
      );

      const { container } = render(<AsteriskAiPage onSelectPost={vi.fn()} />);

      expect(container.querySelector('[data-testid="calendar-delete-card"]')).toBeNull();
      expect(container.querySelector('[data-testid="calendar-approval-card"]')).toBeInTheDocument();
      expect(screen.getByText('AiSuggested')).toBeInTheDocument();
    });
  });

  describe('2. [M-26] FileAttachmentCard Origin & Pathname Type Enforcement', () => {
    it('rejects external URLs spoofing /uploads/files/ or /api/uploads/files/', () => {
      const md = [
        '[첨부파일: evil.mp3](https://evil.com/uploads/files/payload.mp3)',
        '[첨부파일: fake.pdf](https://cnsh.space.evil.com/api/uploads/files/doc.pdf)',
      ].join('\n\n');

      const { container } = render(<MarkdownRenderer content={md} />);

      expect(container.querySelector('.gfm-file-card-container')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      const links = container.querySelectorAll('a.gfm-link');
      expect(links.length).toBe(2);
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('determines FileAttachmentCard type/audio solely from same-origin URL pathname, ignoring link label', () => {
      const md = '[오디오: spoofed.mp3](/api/uploads/files/real_document.pdf)';
      const { container } = render(<MarkdownRenderer content={md} />);

      expect(container.querySelector('.gfm-file-card-container')).toBeInTheDocument();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.querySelector('.gfm-file-card-badge')).toHaveTextContent('PDF');
    });
  });

  describe('3. [M-27] Google Authorize Intercept & Redirect Allowlist', () => {
    it('validates Google authorize redirect URL strictly for https://accounts.google.com', () => {
      expect(isSafeGoogleAuthorizeRedirect('https://accounts.google.com/o/oauth2/v2/auth?client_id=1')).toBe(true);
      expect(isSafeGoogleAuthorizeRedirect('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
      expect(isSafeGoogleAuthorizeRedirect('https://accounts.google.com.evil.com/auth')).toBe(false);
      expect(isSafeGoogleAuthorizeRedirect('https://evil.com/phish')).toBe(false);
      expect(isSafeGoogleAuthorizeRedirect('javascript:alert(1)')).toBe(false);
      expect(isSafeGoogleAuthorizeRedirect('')).toBe(false);
    });

    it('does not intercept external links containing /api/integrations/google/authorize', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const md = '[연동하기](https://evil.com/api/integrations/google/authorize)';
      const { container } = render(<MarkdownRenderer content={md} />);

      const link = container.querySelector('a.gfm-link') as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      fireEvent.click(link);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('intercepts same-origin /api/integrations/google/authorize and blocks malicious data.url redirect', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://evil.com/steal-token' }),
      } as Response);

      const initialHref = window.location.href;
      const md = '[구글 연동](/api/integrations/google/authorize)';
      const { container } = render(<MarkdownRenderer content={md} />);

      const link = container.querySelector('a.gfm-link') as HTMLAnchorElement;
      fireEvent.click(link);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/integrations/google/authorize?format=json',
          expect.objectContaining({ method: 'GET', credentials: 'include' })
        );
      });
      expect(window.location.href).toBe(initialHref);
    });
  });

  describe('4. [M-28] Upload Validation, NFKC, MIME, Size<=0, SVG Rejection, & Markdown Escaping', () => {
    it('blocks NFKC fullwidth dots and whitespace-padded intermediate extensions', () => {
      expect(hasDangerousIntermediateExt('report\uFF0Eexe\uFF0Epdf')).toBe(true);
      expect(hasDangerousIntermediateExt('report. exe .pdf')).toBe(true);
      expect(validateUploadFile({ name: 'report\uFF0Eexe\uFF0Epdf', size: 1024 }).valid).toBe(false);
      expect(validateUploadFile({ name: 'payload\uFF0Eexe', size: 1024 }).valid).toBe(false);
    });

    it('rejects empty or negative file sizes (size <= 0)', () => {
      expect(validateUploadFile({ name: 'empty.pdf', size: 0 }).valid).toBe(false);
      expect(validateUploadFile({ name: 'neg.png', size: -10 }).valid).toBe(false);
    });

    it('validates non-empty file.type against allowed MIME types and rejects dangerous MIMEs', () => {
      expect(validateUploadFile({ name: 'pic.png', size: 100, type: 'image/svg+xml' }).valid).toBe(false);
      expect(validateUploadFile({ name: 'doc.pdf', size: 100, type: 'text/html' }).valid).toBe(false);
      expect(validateUploadFile({ name: 'pic.png', size: 100, type: 'application/pdf' }).valid).toBe(false);
      expect(validateUploadFile({ name: 'pic.png', size: 100, type: 'image/png' }).valid).toBe(true);
      expect(validateUploadFile({ name: 'archive.zip', size: 100, type: 'application/x-zip-compressed' }).valid).toBe(true);
    });

    it('escapes Markdown metacharacters [ ] ( ) in labels and URLs', () => {
      expect(escapeMarkdownLabel('evil](javascript:alert(1)).png')).toBe('evil\\]\\(javascript:alert\\(1\\)\\).png');
      expect(escapeMarkdownUrl('https://example.com/a(b)[c] d')).toBe('https://example.com/a%28b%29%5Bc%5D%20d');
    });

    it('blocks image/svg+xml uploads in AsteriskAiPage', async () => {
      const { container } = render(<AsteriskAiPage onSelectPost={vi.fn()} />);
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();
      expect(fileInput.getAttribute('accept')).not.toContain('image/*');

      const svgFile = new File(['<svg onload="alert(1)"></svg>'], 'evil.svg', { type: 'image/svg+xml' });
      fireEvent.change(fileInput, { target: { files: [svgFile] } });

      await waitFor(() => {
        const toasts = useUIStore.getState().toasts;
        expect(toasts.some((t) => t.type === 'error')).toBe(true);
      });
      expect(container.querySelector('.ai-attached-thumb-img')).toBeNull();

      // Reject spoofed MIME whose FileReader data URL is SVG and show error toast
      const origFileReader = globalThis.FileReader;
      class MockSvgReader {
        result: string | ArrayBuffer | null = null;
        onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
        readAsDataURL() {
          this.result = 'data:image/svg+xml;base64,PHN2Zz4=';
          this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
        }
      }
      vi.stubGlobal('FileReader', MockSvgReader);
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

    it('does not expose raw server err.message in AsteriskAiPage AI error bubble', async () => {
      useAuthStore.setState({
        user: {
          uid: 'user-sec-1',
          email: 'student@g.cnees.kr',
          displayName: '테스트유저',
          photoURL: 'https://example.com/avatar.png',
          agreedTerms: true,
          agreedPrivacy: true,
        },
        loading: false,
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/api/ai/chat/status')) {
          return Promise.resolve({ ok: true, json: async () => ({ remainingSeconds: 0 }) } as Response);
        }
        if (String(url).includes('/api/ai/chat')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Click [here](https://evil.com/phish) leak' }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      });

      render(<AsteriskAiPage onSelectPost={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/asterisk에게 질문을 입력하세요/);
      fireEvent.change(textarea, { target: { value: '안녕' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(screen.getByText(/요청을 처리하는 중 오류가 발생했습니다\./)).toBeInTheDocument();
      });
      expect(screen.queryByText(/evil\.com/)).toBeNull();
      expect(screen.queryByRole('link', { name: 'here' })).toBeNull();
    });
  });

  describe('5. [M-29 & Low] KaTeX Bounds, Non-Checkbox Input Rejection, & LocalStorage Validation', () => {
    it('enforces KaTeX maxSize/maxExpand bounds without crashing or rendering oversized rules', () => {
      const oversizedMath = '$$\\rule{100em}{100em}$$';
      const macroBombMath = '$$\\def\\a{\\a\\a}\\a$$';

      const { container: c1 } = render(<MarkdownRenderer content={oversizedMath} />);
      expect(c1.querySelector('[style*="100em"]')).toBeNull();

      const { container: c2 } = render(<MarkdownRenderer content={macroBombMath} />);
      expect(c2.querySelector('.gfm-markdown-body')).toBeInTheDocument();
    });

    it('validates AsteriskAiPage localStorage transcripts and strips unsafe image URLs', () => {
      expect(parseStoredAiMessages('{"not":"an-array"}')).toBeNull();
      expect(parseStoredAiMessages('[{"id":123,"role":"user"}]')).toBeNull();

      const parsed = parseStoredAiMessages(
        JSON.stringify([
          {
            id: 'ok-1',
            role: 'user',
            content: 'hello',
            createdAt: 12345,
            images: [
              { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', name: 'evil.svg' },
              { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'ok.png' },
            ],
          },
          { id: 'bad-role', role: 'system', content: 'x', createdAt: 1 },
        ])
      );

      expect(parsed).toHaveLength(1);
      expect(parsed?.[0].images).toEqual([{ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'ok.png' }]);
    });

    it('sanitizes user.photoURL in CommentSection composer header and sets referrerPolicy', () => {
      useAuthStore.setState({
        user: {
          uid: 'user-sec-1',
          email: 'student@g.cnees.kr',
          displayName: '테스트유저',
          photoURL: 'javascript:alert(1)',
        },
        loading: false,
      });

      const { container, rerender } = render(<CommentSection postId="1234567" />);
      expect(container.querySelector('img[src^="javascript:"]')).toBeNull();

      useAuthStore.setState({
        user: {
          uid: 'user-sec-1',
          email: 'student@g.cnees.kr',
          displayName: '테스트유저',
          photoURL: 'https://lh3.googleusercontent.com/a/avatar.png',
        },
        loading: false,
      });

      rerender(<CommentSection postId="1234567" />);
      const avatarImg = container.querySelector('img[src="https://lh3.googleusercontent.com/a/avatar.png"]');
      expect(avatarImg).toBeInTheDocument();
      expect(avatarImg).toHaveAttribute('referrerpolicy', 'no-referrer');
    });
  });

  describe('6. [M-30] index.html Unpinned/No-SRI External Asset Removal', () => {
    it('removes unpinned katex CDN, unpinned pretendard CDN, and cse.js from index.html', () => {
      const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).not.toContain('cdn.jsdelivr.net/npm/katex');
      expect(html).not.toContain('orioncactus/pretendard/dist/web/static/pretendard.css');
      expect(html).not.toContain('cse.google.com/cse.js');
    });
  });
});

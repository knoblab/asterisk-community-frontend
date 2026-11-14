import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer Alert Callouts', () => {
  it('renders a warning callout correctly', () => {
    const markdown = '> [!WARNING]\n> This is a warning message.';
    render(<MarkdownRenderer content={markdown} />);
    
    const header = screen.getByText('Warning');
    expect(header).toBeInTheDocument();
    
    const message = screen.getByText('This is a warning message.');
    expect(message).toBeInTheDocument();
  });

  it('renders a note callout with leading whitespace/newline correctly', () => {
    const markdown = '> [!NOTE] 본 커뮤니티는 구성원 간의 건전한 소통을 위해 운영됩니다.';
    render(<MarkdownRenderer content={markdown} />);
    
    const header = screen.getByText('Note');
    expect(header).toBeInTheDocument();
    
    const message = screen.getByText('본 커뮤니티는 구성원 간의 건전한 소통을 위해 운영됩니다.');
    expect(message).toBeInTheDocument();
  });

  it('renders standard blockquote normally without converting to alert', () => {
    const markdown = '> This is a normal blockquote text.';
    render(<MarkdownRenderer content={markdown} />);
    
    // It should not render headers like "Note", "Warning", etc.
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Warning')).not.toBeInTheDocument();
    
    const text = screen.getByText('This is a normal blockquote text.');
    expect(text).toBeInTheDocument();
  });

  it('renders multiple paragraphs inside alert correctly', () => {
    const markdown = '> [!IMPORTANT]\n> First line.\n>\n> Second line.';
    render(<MarkdownRenderer content={markdown} />);
    
    const header = screen.getByText('Important');
    expect(header).toBeInTheDocument();
    
    const firstLine = screen.getByText('First line.');
    const secondLine = screen.getByText('Second line.');
    expect(firstLine).toBeInTheDocument();
    expect(secondLine).toBeInTheDocument();
  });

  it('renders callout inside list item and bold text', () => {
    const markdown = '* > [!WARNING]\n  > **신원 확인 및 학교 차원 조치 안내**\n  >\n  > 서비스 관리자는...';
    render(<MarkdownRenderer content={markdown} />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });
});

describe('MarkdownRenderer Inline Spoilers', () => {
  it('renders inline spoiler with masked style and reveals on click', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const markdown = '범인은 바로 ||주인공의 동생||이었습니다.';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const spoilerEl = container.querySelector('.gfm-spoiler');
    expect(spoilerEl).toBeInTheDocument();
    expect(spoilerEl).toHaveTextContent('주인공의 동생');
    expect(spoilerEl).not.toHaveClass('revealed');

    // Click to reveal
    fireEvent.click(spoilerEl!);
    expect(spoilerEl).toHaveClass('revealed');

    // Click again to hide
    fireEvent.click(spoilerEl!);
    expect(spoilerEl).not.toHaveClass('revealed');
  });
});

describe('MarkdownRenderer Mention Highlighting', () => {
  it('renders registered @asterisk in blue with .mention-tag', () => {
    const markdown = '안녕하세요 @asterisk 무엇이든 물어보세요!';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const mentionEl = container.querySelector('.mention-tag');
    expect(mentionEl).toBeInTheDocument();
    expect(mentionEl).toHaveTextContent('@asterisk');
    expect(mentionEl).toHaveAttribute('data-mention', '@asterisk');
  });

  it('does NOT render unregistered mentions like @unknown or @foobar in blue', () => {
    const markdown = '안녕하세요 @unknown 님과 @foobar 님';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const mentionEl = container.querySelector('.mention-tag');
    expect(mentionEl).not.toBeInTheDocument();
    expect(screen.getByText('안녕하세요 @unknown 님과 @foobar 님')).toBeInTheDocument();
  });

  it('does NOT treat email addresses as mentions', () => {
    const markdown = '문의는 contact@asterisk.com 으로 주세요.';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const mentionEl = container.querySelector('.mention-tag');
    expect(mentionEl).not.toBeInTheDocument();
  });

  it('supports registered mentions inside spoilers and lists', () => {
    const markdown = '- 목록에서 @asterisk 호출\n- ||스포일러 안의 @asterisk||';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const mentions = container.querySelectorAll('.mention-tag');
    expect(mentions.length).toBe(2);
    expect(mentions[0]).toHaveTextContent('@asterisk');
    expect(mentions[1]).toHaveTextContent('@asterisk');
  });
});

describe('MarkdownRenderer Image Same-Tab Links with Return URL', () => {
  it('renders image wrapped in anchor link opening in current tab without target="_blank"', () => {
    const uploadMarkdown = '![업로드 이미지](/api/uploads/images/img_123456789.png)';
    const { container: c1 } = render(<MarkdownRenderer content={uploadMarkdown} />);

    const uploadLink = c1.querySelector('a.gfm-image-link');
    expect(uploadLink).toBeInTheDocument();
    expect(uploadLink?.getAttribute('href')).toContain('/image/img_123456789.png');
    expect(uploadLink).not.toHaveAttribute('target');

    const markdown = '![테스트 이미지](https://example.com/test.png)';
    const { container: c2 } = render(<MarkdownRenderer content={markdown} />);

    const imgLink = c2.querySelector('a.gfm-image-link');
    expect(imgLink).toBeInTheDocument();
    expect(imgLink?.getAttribute('href')).toContain('/image/test.png');
    expect(imgLink).not.toHaveAttribute('target');

    const img = imgLink?.querySelector('img.gfm-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/test.png');
    expect(img).toHaveAttribute('alt', '테스트 이미지');
  });

  it('prevents nested anchor tags when image is already inside a link', () => {
    const markdown = '[![배지](https://example.com/badge.png)](https://example.com/target)';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const outerLink = container.querySelector('a.gfm-link');
    expect(outerLink).toBeInTheDocument();
    expect(outerLink).toHaveAttribute('href', 'https://example.com/target');

    // Inside outerLink, there should be NO nested a.gfm-image-link
    const nestedLink = outerLink?.querySelector('a.gfm-image-link');
    expect(nestedLink).toBeNull();

    // But the image itself should be rendered properly
    const img = outerLink?.querySelector('img.gfm-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/badge.png');
  });

  it('blocks unsafe image URLs like javascript: protocol', () => {
    const markdown = '![위험](javascript:alert(1))';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    expect(container.querySelector('.gfm-image-error')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('MarkdownRenderer File and Video Attachment Cards', () => {
  it('renders technical monochrome file card with Korean filename', () => {
    const markdown = '[첨부파일: 사업계획서_최종본.pdf](/api/uploads/files/file_123.pdf?name=%EC%82%AC%EC%97%85%EA%B3%84%ED%9A%8D%EC%84%9C_%EC%B5%9C%EC%84%A0%EB%B3%B8.pdf)';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const card = container.querySelector('.gfm-file-card-container');
    expect(card).toBeInTheDocument();

    const nameEl = container.querySelector('.gfm-file-card-name');
    expect(nameEl).toHaveTextContent('사업계획서_최종본.pdf');

    const badge = container.querySelector('.gfm-file-card-badge');
    expect(badge).toHaveTextContent('PDF');

    const downloadBtn = container.querySelector('a.gfm-file-download-btn');
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveAttribute('download', '사업계획서_최종본.pdf');
    expect(downloadBtn).toHaveTextContent('다운로드');
  });

  it('renders audio player for audio files', () => {
    const markdown = '[오디오: 배경음악.mp3](/uploads/files/bgm.mp3)';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const audio = container.querySelector('audio');
    expect(audio).toBeInTheDocument();
    expect(audio?.getAttribute('src')).toContain('/uploads/files/bgm.mp3');
  });

  it('renders video card for video attachments', () => {
    const markdown = '[동영상: 시연영상.mp4](/uploads/videos/demo.mp4)';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const videoCard = container.querySelector('.gfm-video-card');
    expect(videoCard).toBeInTheDocument();

    const video = videoCard?.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute('src')).toContain('/uploads/videos/demo.mp4');

    const downloadBtn = videoCard?.querySelector('a.gfm-file-download-btn');
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveAttribute('download', '시연영상.mp4');
  });

  it('strips RTL/Bidi control characters from filenames', () => {
    const evilBidiFilename = '\u202Efdp.evil.exe';
    const markdown = `[첨부파일: ${evilBidiFilename}](/uploads/files/file.pdf)`;
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const nameEl = container.querySelector('.gfm-file-card-name');
    expect(nameEl?.textContent).not.toContain('\u202E');
  });
});

describe('MarkdownRenderer Footnotes', () => {
  it('renders numeric footnote [^1] as plain text 1 without link or external domain/arrow', () => {
    const markdown = '본문 내용입니다[^1].\n\n[^1]: 첫 번째 각주 내용입니다.';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const footnoteRef = container.querySelector('.gfm-footnote-ref');
    expect(footnoteRef).toBeInTheDocument();
    expect(footnoteRef?.tagName.toLowerCase()).toBe('span');
    expect(footnoteRef).toHaveTextContent('1');

    // Must NOT be an <a> tag
    expect(footnoteRef?.closest('a')).toBeNull();

    // Must NOT have external link hostname or icon
    expect(container.querySelector('.gfm-link-hostname')).toBeNull();
    expect(container.querySelector('.gfm-link-icon')).toBeNull();
  });

  it('renders word footnote [^test] as word test without link or external domain/arrow', () => {
    const markdown = '단어 각주 테스트[^test]입니다.\n\n[^test]: 단어 각주에 대한 설명입니다.';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const footnoteRef = container.querySelector('.gfm-footnote-ref');
    expect(footnoteRef).toBeInTheDocument();
    expect(footnoteRef?.tagName.toLowerCase()).toBe('span');
    expect(footnoteRef).toHaveTextContent('test');

    // Must NOT be an <a> tag
    expect(footnoteRef?.closest('a')).toBeNull();

    // Must NOT have external link hostname or icon
    expect(container.querySelector('.gfm-link-hostname')).toBeNull();
    expect(container.querySelector('.gfm-link-icon')).toBeNull();
  });

  it('renders multiple footnotes [^1] and [^test] with correct labels and clean backref', () => {
    const markdown = '첫 번째[^1] 및 두 번째[^test].\n\n[^1]: 각주 1\n[^test]: 각주 test';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const refs = container.querySelectorAll('.gfm-footnote-ref');
    expect(refs.length).toBe(2);
    expect(refs[0]).toHaveTextContent('1');
    expect(refs[1]).toHaveTextContent('test');

    // Neither should be links
    expect(refs[0].closest('a')).toBeNull();
    expect(refs[1].closest('a')).toBeNull();

    // Back references at the bottom
    const backrefs = container.querySelectorAll('.gfm-footnote-backref');
    expect(backrefs.length).toBe(2);
    expect(backrefs[0]).toHaveAttribute('href', '#user-content-fnref-1');
    expect(backrefs[1]).toHaveAttribute('href', '#user-content-fnref-test');
    expect(backrefs[0]).not.toHaveAttribute('target');

    // No external link indicators
    expect(container.querySelector('.gfm-link-hostname')).toBeNull();
    expect(container.querySelector('.gfm-link-icon')).toBeNull();
  });
});

describe('MarkdownRenderer KaTeX Math Rendering', () => {
  it('renders inline math expressions like $E = mc^2$', () => {
    const markdown = '물리학 기본 공식은 $E = mc^2$ 입니다.';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const katexSpan = container.querySelector('.katex');
    expect(katexSpan).toBeInTheDocument();
    expect(katexSpan?.textContent).toContain('E=mc');
  });

  it('renders block math expressions like $$\\sum_{i=1}^n i$$', () => {
    const markdown = '합 공식:\n\n$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const katexDisplay = container.querySelector('.katex-display') || container.querySelector('.katex');
    expect(katexDisplay).toBeInTheDocument();
    expect(katexDisplay?.textContent).toContain('n(n+1)');
  });
});

describe('MarkdownRenderer Inline Emoji to SVG Replacement', () => {
  it('converts common emojis to Lucide SVG icons', () => {
    const markdown = '시험 일정: 📅 11월 9일 🕒 오전 9시 🔔 알림 울림 ✅ 완료';
    const { container } = render(<MarkdownRenderer content={markdown} />);

    const svgs = container.querySelectorAll('.inline-svg-icon');
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });
});

describe('MarkdownRenderer CalendarApprovalCard & Action Links', () => {
  it('renders CalendarApprovalCard when action://calendar-add link is present', () => {
    const markdown = `
윤사 시험 대비 계획입니다.
👉 [구글 캘린더에 이 일정 등록하기](action://calendar-add?summary=%EC%9C%A4%EC%82%AC%20%ED%85%8C%EC%8A%A4%ED%8A%B8%203%ED%9A%8C&start=2026-11-09T09%3A00%3A00%2B09%3A00&end=2026-11-09T10%3A00%3A00%2B09%3A00&description=%EC%8A%A4%ED%94%BC%EB%85%B8%EC%9E%90%20%EB%B3%B5%EC%8A%B5&reminders=780%2C60%2C10)
    `.trim();

    const { container } = render(<MarkdownRenderer content={markdown} allowActionCards />);

    const card = container.querySelector('[data-testid="calendar-approval-card"]');
    expect(card).toBeInTheDocument();
    expect(screen.getByText('윤사 테스트 3회')).toBeInTheDocument();
    expect(screen.getByText(/2026년 11월 9일/)).toBeInTheDocument();
    expect(screen.getByText(/전날 저녁 8시, 1시간 전, 10분 전/)).toBeInTheDocument();
    expect(screen.getByText('스피노자 복습')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
    expect(button).toBeInTheDocument();
  });

  it('handles 1-click registration and switches to success state', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation((url, _options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              event: {
                id: 'evt_123',
                summary: '윤사 테스트 3회',
                htmlLink: 'https://calendar.google.com/event?id=123',
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `[구글 캘린더에 등록](action://calendar-add?summary=%EC%9C%A4%EC%82%AC%20%ED%85%8C%EC%8A%A4%ED%8A%B8%203%ED%9A%8C&start=2026-11-09T09%3A00%3A00%2B09%3A00)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      const button = screen.getByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('구글 캘린더 등록 완료!')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /구글 캘린더에서 일정 보기/i });
        expect(link).toHaveAttribute('href', 'https://calendar.google.com/event?id=123');
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('safely normalizes raw plus (+) timezone in action url without corrupting to space or throwing 400', async () => {
    sessionStorage.clear();
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;
    let postedBody: any = null;

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events')) {
        postedBody = JSON.parse(options?.body || '{}');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              event: {
                id: 'evt_normalized_999',
                summary: '정규화 테스트',
                htmlLink: 'https://calendar.google.com/event?id=999',
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      // Note: raw unescaped '+' in start=2026-11-09T09:00:00+09:00
      const markdown = `[일정 등록](action://calendar-add?summary=%EC%A0%95%EA%B7%9C%ED%99%94%ED%85%8C%EC%8A%A4%ED%8A%B8&start=2026-11-09T09:00:00+09:00&end=2026-11-09T10:00:00+09:00)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      expect(screen.getByText(/2026년 11월 9일/)).toBeInTheDocument();
      expect(screen.getByText(/오전 9:00/)).toBeInTheDocument();

      const button = screen.getByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('구글 캘린더 등록 완료!')).toBeInTheDocument();
        expect(postedBody).not.toBeNull();
        expect(postedBody.startDateTime).toBe('2026-11-09T09:00:00+09:00');
        expect(postedBody.endDateTime).toBe('2026-11-09T10:00:00+09:00');
        expect(postedBody.startDateTime).not.toContain(' ');
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles scope upgrade required alert and shows reauth button', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () =>
            Promise.resolve({
              error: 'insufficient_scope',
              requiresScopeUpgrade: true,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `[등록](action://calendar-add?summary=윤사테스트&start=2026-11-09T09:00:00%2B09:00)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      const button = screen.getByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/권한 업데이트가 필요합니다/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /권한 업데이트/i })).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('renders calendar update approval card and executes PATCH on click', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    let patchCalled = false;
    let patchUrl = '';

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events/evt_abc123')) {
        if (options?.method === 'PATCH') {
          patchCalled = true;
          patchUrl = url;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                event: {
                  id: 'evt_abc123',
                  summary: '윤사 테스트 2회',
                  htmlLink: 'https://calendar.google.com/event?id=abc123',
                },
              }),
          });
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `[수정](action://calendar-update?eventId=evt_abc123&summary=%EC%9C%A4%EC%82%AC%20%ED%85%8C%EC%8A%A4%ED%8A%B8%202%ED%9A%8C&start=2026-11-03T14%3A00%3A00%2B09%3A00&prevTime=%EC%98%A4%EC%A0%84%209%EC%8B%9C)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      expect(screen.getByText('구글 캘린더 일정 변경 대기')).toBeInTheDocument();
      expect(screen.getByText('오전 9시')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: /구글 캘린더 일정 수정하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(patchCalled).toBe(true);
        expect(patchUrl).toContain('/api/integrations/google/calendar/events/evt_abc123');
        expect(screen.getByText('일정 수정 완료!')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('renders calendar delete approval card and executes DELETE on click', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    let deleteCalled = false;
    let deleteUrl = '';

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events/evt_del999')) {
        if (options?.method === 'DELETE') {
          deleteCalled = true;
          deleteUrl = url;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, eventId: 'evt_del999' }),
          });
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `[삭제](action://calendar-delete?eventId=evt_del999&summary=%EC%9C%A4%EC%82%AC%20%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EC%82%AD%EC%A0%9C&targetTime=%EC%98%A4%EC%A0%84%209%EC%8B%9C)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      expect(screen.getByText('구글 캘린더 일정 삭제 승인 대기')).toBeInTheDocument();
      expect(screen.getByText(/이 일정을 구글 캘린더에서 완전히 삭제합니다/)).toBeInTheDocument();

      const button = screen.getByRole('button', { name: /구글 캘린더에서 이 일정 삭제하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
        expect(deleteUrl).toContain('/api/integrations/google/calendar/events/evt_del999');
        expect(screen.getByText(/구글 캘린더에서 일정이 정상적으로 삭제되었습니다/)).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('renders task approval card and executes POST /api/integrations/google/tasks on click', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    let postCalled = false;

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/tasks')) {
        if (options?.method === 'POST') {
          postCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, task: { id: 'task_1', title: '스피노자 에티카 복습' } }),
          });
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `[태스크](action://task-add?title=%EC%8A%A4%ED%48%BC%EB%85%B8%EC%9E%90%20%EC%97%90%ED%8B%B0%EC%B9%B4%20%EB%B3%B5%EC%8A%B5&notes=%EC%8B%A4%EC%B2%B4%20%EC%9D%BC%EC%9B%90%EB%A1%A0)`;
      render(<MarkdownRenderer content={markdown} allowActionCards />);

      expect(screen.getByText('구글 태스크(할 일) 등록 대기')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: /구글 태스크\(할 일\)에 등록하기/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(postCalled).toBe(true);
        expect(screen.getByText('구글 태스크에 할 일이 추가되었습니다!')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('renders multiple approval cards simultaneously and allows independent execution', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const originalFetch = global.fetch;

    const registeredEvents: string[] = [];

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/integrations/google/calendar/events')) {
        const body = JSON.parse(options?.body || '{}');
        registeredEvents.push(body.summary);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              event: {
                id: `evt_${body.summary}`,
                summary: body.summary,
                htmlLink: `https://calendar.google.com/event?id=${encodeURIComponent(body.summary)}`,
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const markdown = `
다음 3개의 일정을 준비했습니다:

1. [물리 실험](action://calendar-add?summary=%EB%AC%BC%EB%A6%AC%20%EC%8B%A4%ED%97%98&start=2026-11-03T15%3A00%3A00%2B09%3A00&end=2026-11-03T16%3A00%3A00%2B09%3A00)
2. [화학 세미나](action://calendar-add?summary=%ED%99%94%ED%95%99%20%EC%84%B8%EB%AF%B8%EB%82%98&start=2026-11-04T16%3A00%3A00%2B09%3A00&end=2026-11-04T17%3A00%3A00%2B09%3A00)
3. [생명과학 스터디](action://calendar-add?summary=%EC%83%9D%EB%AA%85%EA%B3%BC%ED%95%99%20%EC%8A%A4%ED%84%B0%EB%94%94&start=2026-11-05T17%3A00%3A00%2B09%3A00&end=2026-11-05T18%3A00%3A00%2B09%3A00)
      `.trim();

      const { container } = render(<MarkdownRenderer content={markdown} allowActionCards />);

      const cards = container.querySelectorAll('[data-testid="calendar-approval-card"]');
      expect(cards.length).toBe(3);

      expect(screen.getByText('물리 실험')).toBeInTheDocument();
      expect(screen.getByText('화학 세미나')).toBeInTheDocument();
      expect(screen.getByText('생명과학 스터디')).toBeInTheDocument();

      const buttons = screen.getAllByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
      expect(buttons.length).toBe(3);

      // Click the 2nd button (화학 세미나)
      fireEvent.click(buttons[1]);

      await waitFor(() => {
        expect(registeredEvents).toContain('화학 세미나');
        expect(screen.getByText('구글 캘린더 등록 완료!')).toBeInTheDocument();
      });

      // The other two cards must still have pending buttons
      const remainingButtons = screen.getAllByRole('button', { name: /구글 캘린더에 이 일정 등록하기/i });
      expect(remainingButtons.length).toBe(2);

      // Click the 1st button (물리 실험)
      fireEvent.click(remainingButtons[0]);

      await waitFor(() => {
        expect(registeredEvents).toContain('물리 실험');
      });
      expect(registeredEvents).toEqual(['화학 세미나', '물리 실험']);
    } finally {
      global.fetch = originalFetch;
    }
  });
});




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




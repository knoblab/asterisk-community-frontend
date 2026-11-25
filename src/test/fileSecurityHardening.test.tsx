import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { 
  validateUploadFile, 
  sanitizeOriginalFilename, 
  containsBidiOrRtl,
  hasDangerousIntermediateExt
} from '../utils/fileSecurity';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

describe('File Security & Upload Validation Hardening', () => {
  describe('25MB Unified Size Limit', () => {
    it('allows files within 25MB limit', () => {
      const validFile = { name: 'document.pdf', size: 25 * 1024 * 1024 }; // exactly 25MB
      const result = validateUploadFile(validFile);
      expect(result.valid).toBe(true);
    });

    it('rejects files exceeding 25MB limit', () => {
      const largeFile = { name: 'movie.mp4', size: 25 * 1024 * 1024 + 1 }; // 25MB + 1 byte
      const result = validateUploadFile(largeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('25MB');
    });
  });

  describe('Anti-RTL (Right-to-Left Override) & Invisible Character Defense', () => {
    it('detects RTL override character U+202E (RLO) and blocks upload', () => {
      // "test\u202Efdp.exe" appears as "testexe.pdf" to the user
      const spoofedName = 'important_document\u202Efdp.exe';
      expect(containsBidiOrRtl(spoofedName)).toBe(true);

      const result = validateUploadFile({ name: spoofedName, size: 1024 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('RTL');
    });

    it('detects various bidirectional and formatting control characters', () => {
      expect(containsBidiOrRtl('test\u200Efile.pdf')).toBe(true); // LRM
      expect(containsBidiOrRtl('test\u200Ffile.zip')).toBe(true); // RLM
      expect(containsBidiOrRtl('test\u202Afile.mp4')).toBe(true); // LRE
      expect(containsBidiOrRtl('test\u202Bfile.mp3')).toBe(true); // RLE
      expect(containsBidiOrRtl('test\u202Cfile.docx')).toBe(true); // PDF pop
      expect(containsBidiOrRtl('test\u202Dfile.xlsx')).toBe(true); // LRO
      expect(containsBidiOrRtl('test\u2066file.txt')).toBe(true); // LRI
      expect(containsBidiOrRtl('test\u2067file.csv')).toBe(true); // RLI
      expect(containsBidiOrRtl('test\u200Bfile.hwp')).toBe(true); // Zero-width space
      expect(containsBidiOrRtl('test\uFEFFfile.zip')).toBe(true); // BOM
    });

    it('strips all Bidi control characters in sanitizeOriginalFilename', () => {
      const dirty = 'report\u202Efdp.exe\u200B';
      const clean = sanitizeOriginalFilename(dirty);
      expect(containsBidiOrRtl(clean)).toBe(false);
      expect(clean).not.toContain('\u202E');
      expect(clean).not.toContain('\u200B');
    });
  });

  describe('Double Extension & Path Traversal Defense', () => {
    it('blocks double extension disguised attacks', () => {
      expect(hasDangerousIntermediateExt('contract.exe.pdf')).toBe(true);
      expect(hasDangerousIntermediateExt('shell.php.zip')).toBe(true);
      expect(hasDangerousIntermediateExt('script.bat.png')).toBe(true);
      expect(hasDangerousIntermediateExt('trojan.sh.mp4')).toBe(true);
      expect(hasDangerousIntermediateExt('exploit.vbs.docx')).toBe(true);

      const result = validateUploadFile({ name: 'contract.exe.pdf', size: 1024 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('다중 확장자');
    });

    it('allows safe legitimate multiple dots in filename', () => {
      expect(hasDangerousIntermediateExt('my.awesome.document.pdf')).toBe(false);
      expect(hasDangerousIntermediateExt('report.v1.0.final.zip')).toBe(false);
    });

    it('blocks path traversal and null bytes in filename', () => {
      expect(validateUploadFile({ name: '../secret.pdf', size: 1024 }).valid).toBe(false);
      expect(validateUploadFile({ name: 'nested/file.zip', size: 1024 }).valid).toBe(false);
      expect(validateUploadFile({ name: 'c:\\windows\\system.mp3', size: 1024 }).valid).toBe(false);
      expect(validateUploadFile({ name: 'file\0.pdf', size: 1024 }).valid).toBe(false);
    });
  });

  describe('Dangerous File Extension Blacklist vs Allowed Whitelist', () => {
    it('blocks executable and server-side script extensions', () => {
      const dangerousList = [
        'virus.exe', 'script.sh', 'batch.bat', 'shell.php', 'page.html',
        'code.js', 'image.svg', 'service.msi', 'lib.dll', 'config.env'
      ];

      for (const name of dangerousList) {
        const result = validateUploadFile({ name, size: 1024 });
        expect(result.valid).toBe(false);
      }
    });

    it('allows diverse supported files: Video, Audio, PDF, ZIP, Documents, Images', () => {
      const allowedSamples = [
        { name: 'presentation.pdf', expectedCategory: 'file', expectedKind: 'pdf' },
        { name: 'archive.zip', expectedCategory: 'file', expectedKind: 'archive' },
        { name: 'backup.7z', expectedCategory: 'file', expectedKind: 'archive' },
        { name: 'dataset.tar', expectedCategory: 'file', expectedKind: 'archive' },
        { name: 'lecture.mp4', expectedCategory: 'video', expectedKind: 'video' },
        { name: 'recording.webm', expectedCategory: 'video', expectedKind: 'video' },
        { name: 'music.mp3', expectedCategory: 'audio', expectedKind: 'audio' },
        { name: 'voice.wav', expectedCategory: 'audio', expectedKind: 'audio' },
        { name: 'sound.m4a', expectedCategory: 'audio', expectedKind: 'audio' },
        { name: 'song.flac', expectedCategory: 'audio', expectedKind: 'audio' },
        { name: 'notes.txt', expectedCategory: 'file', expectedKind: 'document' },
        { name: 'sheet.xlsx', expectedCategory: 'file', expectedKind: 'document' },
        { name: 'paper.docx', expectedCategory: 'file', expectedKind: 'document' },
        { name: 'assignment.hwp', expectedCategory: 'file', expectedKind: 'document' },
        { name: 'photo.jpg', expectedCategory: 'image', expectedKind: 'image' },
        { name: 'graphic.png', expectedCategory: 'image', expectedKind: 'image' },
      ];

      for (const sample of allowedSamples) {
        const result = validateUploadFile({ name: sample.name, size: 1024 });
        expect(result.valid).toBe(true);
        expect(result.category).toBe(sample.expectedCategory);
        expect(result.kind).toBe(sample.expectedKind);
      }
    });
  });
});

describe('MarkdownRenderer File Category Card UI with SVG Icons', () => {
  it('renders a PDF attachment card with PDF badge and SVG download icon', () => {
    const md = '[첨부파일: 학교생활안내.pdf](/api/uploads/files/file_12345.pdf)';
    const { container } = render(<MarkdownRenderer content={md} />);

    expect(container.querySelector('.gfm-file-card-container')).toBeInTheDocument();
    expect(screen.getByText('학교생활안내.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('다운로드')).toBeInTheDocument();

    const downloadLink = container.querySelector('a.gfm-download-btn');
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink?.getAttribute('href')).toContain('/api/uploads/files/file_12345.pdf');
    expect(downloadLink).toHaveAttribute('download', '학교생활안내.pdf');
  });

  it('renders a ZIP archive card with ZIP badge and download button', () => {
    const md = '[첨부파일: 수업자료모음.zip](/uploads/files/file_zip_999.zip)';
    const { container } = render(<MarkdownRenderer content={md} />);

    expect(screen.getByText('수업자료모음.zip')).toBeInTheDocument();
    expect(screen.getByText('ZIP')).toBeInTheDocument();
    expect(screen.getByText('압축 파일')).toBeInTheDocument();
    expect(container.querySelector('a.gfm-download-btn')).toBeInTheDocument();
  });

  it('renders an Audio file card with player and download button', () => {
    const md = '[오디오: 밴드연주.mp3](/api/uploads/files/file_audio_123.mp3)';
    const { container } = render(<MarkdownRenderer content={md} />);

    expect(screen.getByText('밴드연주.mp3')).toBeInTheDocument();
    expect(screen.getByText('MP3')).toBeInTheDocument();
    expect(screen.getByText('오디오 파일')).toBeInTheDocument();

    const audioElement = container.querySelector('audio');
    expect(audioElement).toBeInTheDocument();
    expect(audioElement?.getAttribute('src')).toContain('/api/uploads/files/file_audio_123.mp3');
    expect(container.querySelector('a.gfm-download-btn')).toBeInTheDocument();
  });

  it('renders a Video card with video player and download button', () => {
    const md = '[동영상: 축제영상.mp4](/media/videos/vid_123.mp4)';
    const { container } = render(<MarkdownRenderer content={md} />);

    const videoElement = container.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement?.getAttribute('src')).toContain('/media/videos/vid_123.mp4');
    expect(screen.getByText('축제영상.mp4')).toBeInTheDocument();
    expect(screen.getByText('다운로드')).toBeInTheDocument();
  });

  it('strips RTL override characters from rendered file attachment cards', () => {
    const md = '[첨부파일: safe\u202Efdp.pdf](/api/uploads/files/file_rtl.pdf)';
    const { container } = render(<MarkdownRenderer content={md} />);

    const card = container.querySelector('.gfm-file-card-container');
    expect(card).toBeInTheDocument();
    expect(card?.textContent).not.toContain('\u202E');
  });
});

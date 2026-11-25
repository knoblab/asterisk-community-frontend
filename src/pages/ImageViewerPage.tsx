import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, ZoomIn, ZoomOut, AlertCircle, Loader2 } from 'lucide-react';
import {
  containsBidiOrRtl,
  removeBidiControlChars,
  sanitizeOriginalFilename,
  deriveSafeDownloadFilename,
  hasAsciiControlChars,
  isFirstPartyImageHost,
  isAllowedFirstPartyImagePath,
  isAllowedFirebaseStorageUrl,
  isSafeReturnPath,
} from '../utils/fileSecurity';

const VIEWER_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function getSafeViewerDownloadFilename(displayLabel: string, src: string): string {
  const derived = deriveSafeDownloadFilename(displayLabel || 'downloaded-image', src, VIEWER_IMAGE_EXTS);
  const dotIdx = derived.lastIndexOf('.');
  const ext = dotIdx > 0 ? derived.slice(dotIdx).toLowerCase() : '';
  if (VIEWER_IMAGE_EXTS.has(ext)) {
    return derived;
  }
  const stem = dotIdx > 0 ? derived.slice(0, dotIdx) : derived;
  return `${sanitizeOriginalFilename(stem || 'downloaded-image')}.png`;
}

const AVATAR_CDN_SUFFIXES = ['googleusercontent.com', 'ggpht.com'];

function isAllowedExternalAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'avatars.githubusercontent.com') return true;
  return AVATAR_CDN_SUFFIXES.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function getSafeImageViewerSrc(rawSrc?: string | null, fallbackFilename?: string): string {
  if (rawSrc && rawSrc.trim()) {
    let decoded = rawSrc.trim();
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch {
      // Keep raw trimmed string if already decoded or malformed percent encoding
    }

    // Reject protocol-relative URLs (//evil.com), control characters, traversal, and RTL/Bidi override attacks
    if (
      !decoded ||
      decoded.startsWith('//') ||
      hasAsciiControlChars(decoded) ||
      containsBidiOrRtl(decoded) ||
      decoded.includes('..') ||
      decoded.includes('\\')
    ) {
      return '';
    }

    // Allow same-origin uploaded image paths only
    const pathOnly = decoded.split(/[?#]/)[0];
    if (decoded.startsWith('/')) {
      return isAllowedFirstPartyImagePath(pathOnly) ? decoded : '';
    }

    try {
      const parsed = new URL(decoded);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return '';
      }
      if (parsed.pathname.includes('..') || parsed.pathname.includes('\\')) {
        return '';
      }
      const host = parsed.hostname.toLowerCase();
      if (isFirstPartyImageHost(host)) {
        return isAllowedFirstPartyImagePath(parsed.pathname) ? parsed.toString() : '';
      }
      if (host === 'firebasestorage.googleapis.com') {
        return isAllowedFirebaseStorageUrl(parsed) ? parsed.toString() : '';
      }
      if (isAllowedExternalAvatarHost(host)) {
        return parsed.toString();
      }
    } catch {
      return '';
    }
    return '';
  }

  if (fallbackFilename && fallbackFilename.trim()) {
    let decodedFile = fallbackFilename.trim();
    try {
      decodedFile = decodeURIComponent(decodedFile).trim();
    } catch {
      // ignore
    }
    if (
      !decodedFile ||
      decodedFile === '.' ||
      decodedFile === '..' ||
      decodedFile.includes('/') ||
      decodedFile.includes('\\') ||
      decodedFile.includes('..') ||
      decodedFile.includes(':') ||
      containsBidiOrRtl(decodedFile)
    ) {
      return '';
    }
    return `/api/uploads/images/${encodeURIComponent(decodedFile)}`;
  }

  return '';
}

export const isValidReturnUrl = (returnUrl?: string | null): boolean => isSafeReturnPath(returnUrl);

export const ImageViewerPage: React.FC = () => {
  const { filename } = useParams<{ filename: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const querySrc = searchParams.get('src');
  const rawDecodedFilename = filename ? (() => {
    try { return decodeURIComponent(filename); } catch { return filename; }
  })() : '';
  const cleanFilename = rawDecodedFilename
    ? sanitizeOriginalFilename(removeBidiControlChars(rawDecodedFilename))
    : '';

  // Determine validated image source URL (prevents javascript:/data: XSS and open redirect)
  const imageSrc = getSafeImageViewerSrc(querySrc, cleanFilename);

  const [isZoomed, setIsZoomed] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(imageSrc));
  const [hasError, setHasError] = useState(!imageSrc);

  useEffect(() => {
    setIsLoading(Boolean(imageSrc));
    setHasError(!imageSrc);
  }, [imageSrc]);

  useEffect(() => {
    document.title = cleanFilename ? `${cleanFilename} - asterisk 이미지 뷰어` : 'asterisk 이미지 뷰어';
    return () => {
      document.title = 'asterisk* cnsh.space';
    };
  }, [cleanFilename]);

  const handleBack = useCallback(() => {
    const stateReturnUrl = (location.state as any)?.returnUrl;
    const queryReturnUrl = searchParams.get('returnUrl');
    const returnUrl = stateReturnUrl || queryReturnUrl;

    if (
      returnUrl &&
      typeof returnUrl === 'string' &&
      returnUrl.startsWith('/') &&
      !returnUrl.startsWith('//') &&
      !returnUrl.includes('\\') && isValidReturnUrl(returnUrl)
    ) {
      navigate(returnUrl);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [location.state, searchParams, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const handleDownload = () => {
    if (!imageSrc || hasError) return;
    const a = document.createElement('a');
    a.href = imageSrc;
    a.download = getSafeViewerDownloadFilename(cleanFilename, imageSrc);
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--surface-dark-bg)',
        color: 'var(--surface-dark-fg)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top Controls Bar */}
      <header
        style={{
          height: 'var(--header-height-mobile)',
          borderBottom: '1px solid var(--alpha-on-dark-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: 'var(--surface-dark-elevated)',
          backdropFilter: 'blur(8px)',
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleBack}
          type="button"
          style={{
            background: 'transparent',
            border: '1px solid var(--alpha-on-dark-medium)',
            color: 'var(--surface-dark-fg)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'var(--transition-fast)',
          }}
          title="뒤로가기"
        >
          <ArrowLeft size={14} />
          <span>돌아가기</span>
        </button>

        <span
          style={{
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--surface-dark-muted)',
            maxWidth: '45vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={cleanFilename}
        >
          {cleanFilename}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsZoomed(!isZoomed)}
            type="button"
            disabled={isLoading || hasError}
            style={{
              background: 'transparent',
              border: '1px solid var(--alpha-on-dark-medium)',
              color: 'var(--surface-dark-fg)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              cursor: isLoading || hasError ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: isLoading || hasError ? 0.4 : 1,
            }}
            title={isZoomed ? '화면 맞춤' : '100% 원본 크기'}
          >
            {isZoomed ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
            <span style={{ display: 'none' }}>확대/축소</span>
          </button>

          {imageSrc && !hasError && (
            <>
              <button
                onClick={handleDownload}
                type="button"
                disabled={isLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--alpha-on-dark-medium)',
                  color: 'var(--surface-dark-fg)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isLoading ? 0.4 : 1,
                }}
                title="원본 파일 다운로드"
              >
                <Download size={14} />
                <span>다운로드</span>
              </button>

              <a
                href={imageSrc}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--alpha-on-dark-medium)',
                  color: 'var(--surface-dark-fg)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                }}
                title="새 탭에서 직접 열기"
              >
                <ExternalLink size={14} />
              </a>
            </>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: isZoomed ? 'auto' : 'hidden',
          padding: isZoomed ? '24px' : '12px',
          position: 'relative',
        }}
        onClick={() => {
          if (!isLoading && !hasError) setIsZoomed(!isZoomed);
        }}
      >
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--surface-dark-muted)',
            }}
          >
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>이미지 불러오는 중...</span>
          </div>
        )}

        {hasError ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--color-red)',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <AlertCircle size={36} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>이미지를 불러올 수 없습니다.</span>
            <span style={{ fontSize: '12px', color: 'var(--surface-dark-muted)', fontFamily: 'var(--font-mono)' }}>
              {imageSrc ? `경로: ${imageSrc}` : '허용되지 않거나 잘못된 이미지 경로입니다.'}
            </span>
          </div>
        ) : (
          <img
            src={imageSrc}
            alt={cleanFilename || '이미지'}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            style={{
              display: isLoading ? 'none' : 'block',
              maxWidth: isZoomed ? 'none' : '96vw',
              maxHeight: isZoomed ? 'none' : 'calc(100vh - 84px)',
              objectFit: 'contain',
              cursor: isZoomed ? 'zoom-out' : 'zoom-in',
              boxShadow: 'var(--shadow-toast)',
              borderRadius: 'var(--radius-sm)',
              transition: 'var(--transition-fast)',
            }}
          />
        )}
      </main>
    </div>
  );
};

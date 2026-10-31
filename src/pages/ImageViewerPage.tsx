import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, ZoomIn, ZoomOut, AlertCircle, Loader2 } from 'lucide-react';
import { containsBidiOrRtl } from '../utils/fileSecurity';

export function getSafeImageViewerSrc(rawSrc?: string | null, fallbackFilename?: string): string {
  if (rawSrc && rawSrc.trim()) {
    let decoded = rawSrc.trim();
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch {
      // Keep raw trimmed string if already decoded or malformed percent encoding
    }

    // Reject protocol-relative URLs (//evil.com), control characters, and RTL/Bidi override attacks
    if (!decoded || decoded.startsWith('//') || /[\u0000-\u001F\u007F]/.test(decoded) || containsBidiOrRtl(decoded)) {
      return '';
    }

    // Allow same-origin uploaded image paths without path traversal
    if (decoded.startsWith('/api/uploads/images/') || decoded.startsWith('/uploads/images/')) {
      if (decoded.includes('..') || decoded.includes('\\')) {
        return '';
      }
      return decoded;
    }

    try {
      const parsed = new URL(decoded);
      if (parsed.protocol === 'https:' || parsed.protocol === 'blob:') {
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

export const isValidReturnUrl = (returnUrl?: string | null): boolean => {
  if (!returnUrl || typeof returnUrl !== 'string') return false;
  return returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.includes('\\');
};

export const ImageViewerPage: React.FC = () => {
  const { filename } = useParams<{ filename: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const querySrc = searchParams.get('src');
  const cleanFilename = filename ? (() => {
    try { return decodeURIComponent(filename); } catch { return filename; }
  })() : '';

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
    a.download = cleanFilename || 'downloaded-image';
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
        backgroundColor: '#0a0a0c',
        color: '#f7f6f2',
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
          height: '56px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: 'rgba(10, 10, 12, 0.95)',
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
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#f7f6f2',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
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
            color: '#a0a19b',
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
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#f7f6f2',
              padding: '6px 10px',
              borderRadius: '4px',
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

          <button
            onClick={handleDownload}
            type="button"
            disabled={isLoading || hasError}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#f7f6f2',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: isLoading || hasError ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isLoading || hasError ? 0.4 : 1,
            }}
            title="원본 파일 다운로드"
          >
            <Download size={14} />
            <span>다운로드</span>
          </button>

          {imageSrc && (
            <a
              href={imageSrc}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#f7f6f2',
                padding: '6px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
              title="새 탭에서 직접 열기"
            >
              <ExternalLink size={14} />
            </a>
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
              color: '#a0a19b',
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
              color: '#e03020',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <AlertCircle size={36} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>이미지를 불러올 수 없습니다.</span>
            <span style={{ fontSize: '12px', color: '#a0a19b', fontFamily: 'var(--font-mono)' }}>
              {imageSrc ? `경로: ${imageSrc}` : '허용되지 않거나 잘못된 이미지 경로입니다.'}
            </span>
            {imageSrc && (
              <a
                href={imageSrc}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: '8px',
                  padding: '6px 14px',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                직접 링크 열기
              </a>
            )}
          </div>
        ) : (
          <img
            src={imageSrc}
            alt={cleanFilename || '이미지'}
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
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              borderRadius: '2px',
              transition: 'transform 0.15s ease',
            }}
          />
        )}
      </main>
    </div>
  );
};

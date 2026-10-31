import React, { useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Copy, Check, ExternalLink, Film, Download,
  FileText, Archive, Music, FileSpreadsheet, FileCode, File
} from 'lucide-react';
import { useUIStore } from '../stores/useUIStore';
import { isKnownMention, getKnownMention } from '../constants/mentions';
import { removeBidiControlChars } from '../utils/fileSecurity';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const getSafeUrl = (value?: string) => {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (['http:', 'https:', 'blob:'].includes(url.protocol)) {
      return url.toString();
    }
    if (url.protocol === 'data:' && value.startsWith('data:image/') && !value.toLowerCase().startsWith('data:image/svg')) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
};

export const getSafeImageUrl = (value?: string): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('//') || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith('data:image/')) {
    if (trimmed.toLowerCase().startsWith('data:image/svg')) {
      return null;
    }
    return trimmed;
  }
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(trimmed, origin);
    if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
      return null;
    }
    const isSameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;
    if (isSameOrigin || trimmed.startsWith('/')) {
      const pathname = parsed.pathname;
      if (pathname.includes('..') || pathname.includes('\\')) return null;
      // Block arbitrary /api/* endpoints (e.g. /api/logout, /api/posts) from being triggered as image tags
      if (pathname.startsWith('/api/') && !pathname.startsWith('/api/uploads/') && !pathname.startsWith('/api/media/')) {
        return null;
      }
      if (trimmed.startsWith('/')) {
        return parsed.pathname + parsed.search;
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const FlatAlertIcon: React.FC<{ type: 'note' | 'tip' | 'important' | 'warning' | 'caution' }> = ({ type }) => {
  switch (type) {
    case 'note':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="gfm-alert-svg">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1 0-1.5h.25V8.5h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        </svg>
      );
    case 'tip':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="gfm-alert-svg">
          <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 1.63.87 3.06 2.17 3.84a2.75 2.75 0 0 1 .93 2.16v.25a.75.75 0 0 0 .75.75h1.3a.75.75 0 0 0 .75-.75v-.25c0-.85.34-1.64.93-2.16A4.501 4.501 0 0 0 8 1.5ZM5 6a3 3 0 1 1 6 0c0 1.09-.58 2.05-1.46 2.58a4.25 4.25 0 0 0-1.44 3.34h-.2a4.25 4.25 0 0 0-1.44-3.34A3.001 3.001 0 0 1 5 6Zm1.5 8.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Z" />
        </svg>
      );
    case 'important':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="gfm-alert-svg">
          <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H11.5l-3.03 2.727a.75.75 0 0 1-1.006 0L4.5 13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h3.25a.75.75 0 0 1 .53.22L8 14.293l2.47-2.223a.75.75 0 0 1 .53-.22h3.25a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25ZM8 3.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 3.5Zm0 6a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75Z" />
        </svg>
      );
    case 'warning':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="gfm-alert-svg">
          <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        </svg>
      );
    case 'caution':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="gfm-alert-svg">
          <path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
        </svg>
      );
  }
};

const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const addToast = useUIStore((state) => state.addToast);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      addToast('코드가 클립보드에 복사되었습니다.', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="gfm-code-wrapper">
      <div className="gfm-code-header">
        <span className="gfm-code-lang">{language || 'code'}</span>
        <button className="gfm-code-copy" onClick={handleCopy} title="코드 복사">
          {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
          <span>{copied ? '복사됨' : '복사'}</span>
        </button>
      </div>
      <pre className="gfm-code-pre">
        <code>{value}</code>
      </pre>
    </div>
  );
};

const isWhitespaceNode = (node: React.ReactNode): boolean => {
  if (node === null || node === undefined || node === false || node === true) return true;
  if (typeof node === 'string') return node.trim() === '';
  if (Array.isArray(node)) return node.every(isWhitespaceNode);
  if (React.isValidElement(node)) {
    const children = (node.props as any)?.children;
    if (!children) return true;
    return isWhitespaceNode(children);
  }
  return false;
};

// Recursive helper to find and strip GitHub Alert prefix [!NOTE], [!WARNING] etc.
const findAndCleanAlert = (
  node: React.ReactNode
): { alertType: 'note' | 'tip' | 'important' | 'warning' | 'caution' | null; cleanedNode: React.ReactNode } => {
  if (!node) return { alertType: null, cleanedNode: node };

  if (typeof node === 'string') {
    const match = node.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i);
    if (match) {
      const alertType = match[1].toLowerCase() as any;
      const remaining = node.slice(match[0].length);
      return { alertType, cleanedNode: remaining };
    }
    return { alertType: null, cleanedNode: node };
  }

  if (Array.isArray(node)) {
    if (node.length === 0) return { alertType: null, cleanedNode: node };
    
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      
      // Skip empty strings/whitespace-only text nodes and empty fragments
      if (isWhitespaceNode(child)) {
        continue;
      }
      
      const { alertType, cleanedNode: childCleaned } = findAndCleanAlert(child);
      if (alertType) {
        const newArray = [...node];
        if (childCleaned === '' || childCleaned === null || childCleaned === undefined) {
          newArray.splice(i, 1);
        } else {
          newArray[i] = childCleaned;
        }
        const filteredArray = newArray.filter((item) => !isWhitespaceNode(item));
        return { alertType, cleanedNode: filteredArray };
      }
      
      // Stop searching once we encounter the first non-whitespace content that is not an alert
      break;
    }
    
    return { alertType: null, cleanedNode: node };
  }

  if (React.isValidElement(node)) {
    if (node.type === React.Fragment) {
      const children = (node.props as any)?.children;
      return findAndCleanAlert(children);
    }

    const children = (node.props as any)?.children;
    if (children) {
      const { alertType, cleanedNode: childrenCleaned } = findAndCleanAlert(children);
      if (alertType) {
        const isChildrenEmpty = Array.isArray(childrenCleaned)
          ? childrenCleaned.every(isWhitespaceNode)
          : isWhitespaceNode(childrenCleaned);
        const element = node as React.ReactElement<any>;
        const childrenArray = Array.isArray(childrenCleaned) ? childrenCleaned : [childrenCleaned];
        const newNode = isChildrenEmpty ? null : React.cloneElement(element, element.props, ...childrenArray);
        return { alertType, cleanedNode: newNode };
      }
    }
  }

  return { alertType: null, cleanedNode: node };
};

const SpoilerSpan: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`gfm-spoiler ${revealed ? 'revealed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      title={revealed ? '클릭하여 스포일러 가리기' : '클릭하여 스포일러 보기'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed((prev) => !prev);
        }
      }}
    >
      {children}
    </span>
  );
};

export const renderMentionsInText = (text: string): React.ReactNode => {
  if (!text || !text.includes('@')) return text;

  // Match mention-like handle preceded by start of string or non-alphanumeric character
  const mentionRegex = /(^|[^a-zA-Z0-9_])(@[a-zA-Z0-9_-]+)(?![a-zA-Z0-9_-])/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    const prefix = match[1]; // boundary character or empty string
    const handle = match[2]; // e.g. '@asterisk'
    const matchStart = match.index;
    const prefixOffset = prefix.length;
    const handleStart = matchStart + prefixOffset;
    const handleEnd = handleStart + handle.length;

    // Only style verified/existing registered mentions in blue
    if (isKnownMention(handle)) {
      if (handleStart > lastIndex) {
        elements.push(text.slice(lastIndex, handleStart));
      }
      const mentionDef = getKnownMention(handle);
      elements.push(
        <span
          key={`mention-${handleStart}`}
          className="mention-tag"
          data-mention={handle.toLowerCase()}
          data-mention-type={mentionDef?.type || 'mention'}
          title={mentionDef ? `${mentionDef.name} (${mentionDef.handle})` : handle}
          style={{
            color: 'var(--color-mention-blue, #2563EB)',
            fontWeight: 600,
          }}
        >
          {handle}
        </span>
      );
      lastIndex = handleEnd;
      mentionRegex.lastIndex = handleEnd;
    }
  }

  if (lastIndex === 0) {
    return text;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <React.Fragment>{elements}</React.Fragment>;
};

const renderFormattedText = (node: React.ReactNode): React.ReactNode => {
  if (!node) return node;

  if (typeof node === 'string') {
    const cleanStr = removeBidiControlChars(node);
    if (cleanStr.includes('||')) {
      const parts = cleanStr.split(/(\|\|[\s\S]+?\|\|)/g);
      if (parts.length > 1) {
        return parts.map((part, index) => {
          if (part.startsWith('||') && part.endsWith('||') && part.length >= 4) {
            const innerText = part.slice(2, -2);
            return <SpoilerSpan key={index}>{renderFormattedText(innerText)}</SpoilerSpan>;
          }
          return renderMentionsInText(part);
        });
      }
    }
    return renderMentionsInText(cleanStr);
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>{renderFormattedText(child)}</React.Fragment>
    ));
  }

  if (React.isValidElement(node)) {
    const props = (node.props as any) || {};
    if (props.children) {
      return React.cloneElement(node, {
        ...props,
        children: renderFormattedText(props.children),
      });
    }
  }

  return node;
};

// Alias renderFormattedText as renderSpoilers for clean backwards compatibility
const renderSpoilers = renderFormattedText;

const InLinkContext = React.createContext<boolean>(false);

export const getImageViewerUrl = (src: string, returnUrl?: string): string => {
  if (!src) return '';
  let baseViewer = '';
  // Check if it's an uploaded image path like /api/uploads/images/filename or /uploads/images/filename
  const match = src.match(/(?:\/api)?\/uploads\/images\/([^\/\?#]+)/);
  if (match) {
    baseViewer = `/image/${match[1]}`;
  } else {
    // If absolute URL pointing to our backend or domain
    try {
      const parsed = new URL(src, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const domainMatch = parsed.pathname.match(/(?:\/api)?\/uploads\/images\/([^\/\?#]+)/);
      if (domainMatch) {
        baseViewer = `/image/${domainMatch[1]}`;
      } else {
        const filename = parsed.pathname.split('/').pop() || 'image';
        baseViewer = `/image/${encodeURIComponent(filename)}?src=${encodeURIComponent(src)}`;
      }
    } catch {
      baseViewer = `/image/image?src=${encodeURIComponent(src)}`;
    }
  }

  if (returnUrl) {
    const sep = baseViewer.includes('?') ? '&' : '?';
    return `${baseViewer}${sep}returnUrl=${encodeURIComponent(returnUrl)}`;
  }
  return baseViewer;
};

const getFileTypeDetails = (url: string, name: string) => {
  const target = (name || url).split('?')[0].split('#')[0].toLowerCase();
  const dotIdx = target.lastIndexOf('.');
  const ext = dotIdx !== -1 ? target.slice(dotIdx) : '';

  if (ext === '.pdf') {
    return {
      type: 'pdf',
      badge: 'PDF',
      label: 'PDF 문서',
    };
  }
  if (['.zip', '.7z', '.tar', '.gz', '.rar'].includes(ext)) {
    return {
      type: 'archive',
      badge: ext.replace('.', '').toUpperCase(),
      label: '압축 파일',
    };
  }
  if (['.mp3', '.wav', '.m4a', '.flac', '.aac', '.opus'].includes(ext)) {
    return {
      type: 'audio',
      badge: ext.replace('.', '').toUpperCase(),
      label: '오디오 파일',
    };
  }
  if (['.xls', '.xlsx', '.csv'].includes(ext)) {
    return {
      type: 'sheet',
      badge: ext.replace('.', '').toUpperCase(),
      label: '스프레드시트',
    };
  }
  if (['.doc', '.docx', '.hwp', '.hwpx'].includes(ext)) {
    return {
      type: 'doc',
      badge: ext.replace('.', '').toUpperCase(),
      label: '문서 파일',
    };
  }
  if (['.ppt', '.pptx'].includes(ext)) {
    return {
      type: 'ppt',
      badge: ext.replace('.', '').toUpperCase(),
      label: '프레젠테이션',
    };
  }
  if (['.txt'].includes(ext)) {
    return {
      type: 'code',
      badge: 'TXT',
      label: '텍스트 문서',
    };
  }
  return {
    type: 'file',
    badge: ext ? ext.replace('.', '').toUpperCase() : 'FILE',
    label: '첨부파일',
  };
};

const FileAttachmentCard: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) => {
  const rawChildText = typeof children === 'string'
    ? children
    : (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '');

  const displayLabel = rawChildText.replace(/^(?:첨부파일|오디오|동영상|파일)\s*:\s*/i, '').trim();
  const fileDetails = getFileTypeDetails(url, displayLabel);
  const cleanFilename = removeBidiControlChars(displayLabel || fileDetails.label);
  const isAudio = fileDetails.type === 'audio';

  const renderIcon = () => {
    switch (fileDetails.type) {
      case 'pdf':
        return <FileText size={18} />;
      case 'archive':
        return <Archive size={18} />;
      case 'audio':
        return <Music size={18} />;
      case 'sheet':
        return <FileSpreadsheet size={18} />;
      case 'doc':
      case 'ppt':
        return <FileText size={18} />;
      case 'code':
        return <FileCode size={18} />;
      default:
        return <File size={18} />;
    }
  };

  return (
    <span className="gfm-file-card-container">
      <span className="gfm-file-card-main">
        {/* Left: Category Icon + Filename + Badge */}
        <span className="gfm-file-card-left">
          <span className="gfm-file-card-icon">
            {renderIcon()}
          </span>
          <span className="gfm-file-card-info">
            <span
              className="gfm-file-card-name"
              title={cleanFilename}
            >
              {cleanFilename}
            </span>
            <span className="gfm-file-card-sub">
              <span className="gfm-file-card-badge">
                {fileDetails.badge}
              </span>
              <span className="gfm-file-card-label">
                {fileDetails.label}
              </span>
            </span>
          </span>
        </span>

        {/* Right: Download Action Button with SVG Download Icon */}
        <a
          href={url}
          download={cleanFilename}
          target="_blank"
          rel="noopener noreferrer"
          title={`파일 다운로드 (${cleanFilename})`}
          className="gfm-file-download-btn gfm-download-btn"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={13} />
          <span>다운로드</span>
        </a>
      </span>

      {/* Audio Inline Player */}
      {isAudio && (
        <span style={{ marginTop: '4px', width: '100%', display: 'block' }}>
          <audio
            controls
            preload="metadata"
            src={url}
            style={{
              width: '100%',
              height: '34px',
              borderRadius: 'var(--radius-sm, 2px)',
              display: 'block',
            }}
          >
            해당 브라우저에서는 오디오 태그를 지원하지 않습니다.
          </audio>
        </span>
      )}
    </span>
  );
};

const MarkdownImage: React.FC<any> = ({ src, alt, ...props }) => {
  const isInLink = React.useContext(InLinkContext);
  const safeSrc = getSafeImageUrl(src);

  if (!safeSrc) {
    return <span className="gfm-image-error">[안전하지 않은 이미지 링크]</span>;
  }

  const cleanAlt = removeBidiControlChars(alt || '첨부 이미지');
  const imageElement = (
    <img
      {...props}
      src={safeSrc}
      alt={cleanAlt}
      className={`gfm-image ${props.className || ''}`.trim()}
      loading="lazy"
    />
  );

const ImageLinkWithNavigate: React.FC<{
  viewerUrl: string;
  returnUrl?: string;
  children: React.ReactNode;
}> = ({ viewerUrl, returnUrl, children }) => {
  const navigate = useNavigate();

  return (
    <a
      href={viewerUrl}
      className="gfm-image-link"
      title="이미지 크게 보기 (클릭)"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigate(viewerUrl, { state: { returnUrl } });
      }}
    >
      {children}
    </a>
  );
};

const ImageLinkFallback: React.FC<{
  viewerUrl: string;
  children: React.ReactNode;
}> = ({ viewerUrl, children }) => {
  return (
    <a
      href={viewerUrl}
      className="gfm-image-link"
      title="이미지 크게 보기 (클릭)"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {children}
    </a>
  );
};

const SafeImageLink: React.FC<{
  viewerUrl: string;
  returnUrl?: string;
  children: React.ReactNode;
}> = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <ImageLinkWithNavigate {...props} />;
  }
  return <ImageLinkFallback viewerUrl={props.viewerUrl}>{props.children}</ImageLinkFallback>;
};

  const currentPath = typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '';
  const viewerUrl = getImageViewerUrl(safeSrc, currentPath);

  return (
    <span className="gfm-image-container">
      {isInLink ? (
        imageElement
      ) : (
        <SafeImageLink viewerUrl={viewerUrl} returnUrl={currentPath}>
          {imageElement}
        </SafeImageLink>
      )}
      {cleanAlt && cleanAlt !== '이미지' && !cleanAlt.startsWith('image.') && (
        <span className="gfm-image-caption">{cleanAlt}</span>
      )}
    </span>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const inRouter = useInRouterContext();
  const navigate = inRouter ? useNavigate() : null;

  // Guard against undefined/null content to prevent react-markdown crash
  const safeContent = content || '';

  return (
    <div className={`gfm-markdown-body ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p({ children, ...props }: any) {
            return <p {...props}>{renderSpoilers(children)}</p>;
          },
          li({ children, ...props }: any) {
            return <li {...props}>{renderSpoilers(children)}</li>;
          },
          td({ children, ...props }: any) {
            return <td {...props}>{renderSpoilers(children)}</td>;
          },
          th({ children, ...props }: any) {
            return <th {...props}>{renderSpoilers(children)}</th>;
          },
          h1({ children, ...props }: any) {
            return <h1 {...props}>{renderSpoilers(children)}</h1>;
          },
          h2({ children, ...props }: any) {
            return <h2 {...props}>{renderSpoilers(children)}</h2>;
          },
          h3({ children, ...props }: any) {
            return <h3 {...props}>{renderSpoilers(children)}</h3>;
          },
          h4({ children, ...props }: any) {
            return <h4 {...props}>{renderSpoilers(children)}</h4>;
          },
          h5({ children, ...props }: any) {
            return <h5 {...props}>{renderSpoilers(children)}</h5>;
          },
          h6({ children, ...props }: any) {
            return <h6 {...props}>{renderSpoilers(children)}</h6>;
          },
          strong({ children, ...props }: any) {
            return <strong {...props}>{renderSpoilers(children)}</strong>;
          },
          em({ children, ...props }: any) {
            return <em {...props}>{renderSpoilers(children)}</em>;
          },
          del({ children, ...props }: any) {
            return <del {...props}>{renderSpoilers(children)}</del>;
          },

          // Code & Syntax
          code({ _node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');

            if (!inline && (match || codeContent.includes('\n'))) {
              return <CodeBlock language={match ? match[1] : undefined} value={codeContent} />;
            }
            return (
              <code className="gfm-inline-code" {...props}>
                {children}
              </code>
            );
          },

          // Links with Video & File Attachment Support, Footnotes and RTL Defense
          a({ href, children, ...props }: any) {
            // 1. Footnote Reference ([^1], [^test]) - Render without link styling or external badges
            const isFootnoteRef =
              props['data-footnote-ref'] !== undefined ||
              Boolean(props['data-footnote-ref']) ||
              (typeof href === 'string' && href.startsWith('#user-content-fn-'));

            if (isFootnoteRef) {
              let label = '';
              if (typeof href === 'string' && href.startsWith('#user-content-fn-')) {
                try {
                  label = decodeURIComponent(href.replace(/^#user-content-fn-/, ''));
                } catch {
                  label = href.replace(/^#user-content-fn-/, '');
                }
              }
              const displayLabel = label || children;
              return (
                <span className="gfm-footnote-ref" id={props.id}>
                  {displayLabel}
                </span>
              );
            }

            // 2. Footnote Back Reference (↩ at footnote definition list)
            const isFootnoteBackref =
              props['data-footnote-backref'] !== undefined ||
              Boolean(props['data-footnote-backref']) ||
              (typeof props.className === 'string' && props.className.includes('data-footnote-backref')) ||
              (typeof href === 'string' && href.startsWith('#user-content-fnref-'));

            if (isFootnoteBackref) {
              return (
                <a
                  href={href}
                  className="gfm-footnote-backref"
                  aria-label={props['aria-label'] || '각주 참조 위치로 이동'}
                  title="본문으로 이동"
                  onClick={(e) => {
                    if (href && href.startsWith('#')) {
                      e.preventDefault();
                      const targetId = href.slice(1);
                      const target = document.getElementById(targetId);
                      if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }
                  }}
                >
                  {children}
                </a>
              );
            }

            // 3. Internal Hash Anchor Links (#section, #heading, etc.)
            if (typeof href === 'string' && href.startsWith('#')) {
              return (
                <InLinkContext.Provider value={true}>
                  <a
                    href={href}
                    className="gfm-link"
                    {...props}
                    onClick={(e) => {
                      e.preventDefault();
                      const targetId = href.slice(1);
                      const target = document.getElementById(targetId);
                      if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                  >
                    {renderSpoilers(children)}
                  </a>
                </InLinkContext.Provider>
              );
            }

            const safeUrl = getSafeUrl(href);
            if (!safeUrl) {
              return <span>{children}</span>;
            }

            // Check if link points to an uploaded or safe video file (internal media only)
            const originStr = typeof window !== 'undefined' ? window.location.origin : '';
            const isInternalMedia =
              safeUrl.startsWith('/media/') ||
              safeUrl.startsWith('/api/media/') ||
              safeUrl.startsWith('/uploads/') ||
              safeUrl.startsWith('/api/uploads/') ||
              (Boolean(originStr) && safeUrl.startsWith(originStr) &&
                (safeUrl.includes('/media/') || safeUrl.includes('/uploads/')));

            const isVideo = isInternalMedia && /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(safeUrl);

            if (isVideo) {
              const rawChildText = typeof children === 'string'
                ? children
                : (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '');
              const displayLabel = rawChildText.replace(/^(?:동영상|비디오|파일)\s*:\s*/i, '').trim();
              const cleanFilename = removeBidiControlChars(displayLabel || '동영상 파일');

              return (
                <span className="gfm-video-card">
                  <video
                    controls
                    preload="metadata"
                    src={safeUrl}
                  >
                    해당 브라우저에서는 비디오 태그를 지원하지 않습니다.
                  </video>
                  <span className="gfm-video-card-meta">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--color-text-secondary)', minWidth: 0, overflow: 'hidden' }}>
                      <Film size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanFilename}</span>
                    </span>
                    <a
                      href={safeUrl}
                      download={cleanFilename}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`동영상 다운로드 (${cleanFilename})`}
                      className="gfm-file-download-btn gfm-download-btn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download size={12} />
                      <span>다운로드</span>
                    </a>
                  </span>
                </span>
              );
            }

            // Check if link points to an uploaded file or downloadable document/archive/audio
            const isFileAttachment =
              safeUrl.includes('/uploads/files/') ||
              safeUrl.includes('/api/uploads/files/') ||
              (isInternalMedia && /\.(pdf|zip|7z|tar|gz|docx?|xlsx?|pptx?|hwpx?|txt|csv|mp3|wav|m4a|flac|aac|opus)(\?.*)?$/i.test(safeUrl));

            if (isFileAttachment) {
              return (
                <InLinkContext.Provider value={true}>
                  <FileAttachmentCard url={safeUrl}>
                    {renderSpoilers(children)}
                  </FileAttachmentCard>
                </InLinkContext.Provider>
              );
            }

            let hostname = '';
            let isExternal = false;
            let isInternalPostLink = false;
            let postPath = '';
            try {
              const parsed = new URL(safeUrl, typeof window !== 'undefined' ? window.location.origin : 'https://cnsh.space');
              isExternal = typeof window !== 'undefined' ? parsed.origin !== window.location.origin : true;
              if (isExternal) {
                hostname = parsed.hostname;
              } else if (/^\/post\/\d{7}\/?$/i.test(parsed.pathname)) {
                isInternalPostLink = true;
                postPath = parsed.pathname;
              }
            } catch {}

            return (
              <InLinkContext.Provider value={true}>
                <a
                  href={safeUrl}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  title={isInternalPostLink ? '게시글 바로가기 (클릭)' : (isExternal ? `외부 링크: ${safeUrl}` : undefined)}
                  className={`gfm-link ${isInternalPostLink ? 'gfm-post-link' : ''}`}
                  onClick={(e) => {
                    if (props.onClick) {
                      props.onClick(e);
                    }
                    if (!e.defaultPrevented && safeUrl.includes('/api/integrations/google/authorize')) {
                      e.preventDefault();
                      fetch('/api/integrations/google/authorize?format=json', {
                        method: 'GET',
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                      })
                        .then((res) => res.json())
                        .then((data) => {
                          if (data?.url) {
                            window.location.href = data.url;
                          }
                        })
                        .catch(() => {
                          window.location.href = safeUrl;
                        });
                      return;
                    }
                    if (!e.defaultPrevented && isInternalPostLink && navigate) {
                      e.preventDefault();
                      navigate(postPath);
                    }
                  }}
                  {...props}
                >
                  {renderSpoilers(children)}
                  {isExternal && hostname && <span className="gfm-link-hostname">({hostname})</span>}
                  {isExternal && <ExternalLink size={12} className="gfm-link-icon" />}
                </a>
              </InLinkContext.Provider>
            );
          },

          // Images with Safety & Direct New Tab Link Preview
          img: MarkdownImage,

          // GitHub Alert / Callout Blockquotes with Flat Design SVGs
          blockquote({ children }: any) {
            const { alertType, cleanedNode } = findAndCleanAlert(children);

            if (alertType) {
              const titles = {
                note: 'Note',
                tip: 'Tip',
                important: 'Important',
                warning: 'Warning',
                caution: 'Caution',
              };

              return (
                <div className={`gfm-alert gfm-alert-${alertType}`}>
                  <div className="gfm-alert-header">
                    <FlatAlertIcon type={alertType} />
                    <span>{titles[alertType]}</span>
                  </div>
                  <div className="gfm-alert-content">{renderSpoilers(cleanedNode)}</div>
                </div>
              );
            }

            return <blockquote className="gfm-blockquote">{renderSpoilers(children)}</blockquote>;
          },

          // Tables
          table({ children }: any) {
            return (
              <div className="gfm-table-wrapper">
                <table className="gfm-table">{children}</table>
              </div>
            );
          },

          // Task list Checkboxes
          input({ type, checked, ...props }: any) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="gfm-checkbox"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
};

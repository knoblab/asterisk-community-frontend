import React, { useState } from 'react';

export function getSafeAvatarUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('//') || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  // Allow same-origin uploaded image paths only
  if (trimmed.startsWith('/api/uploads/images/') || trimmed.startsWith('/uploads/images/')) {
    if (trimmed.includes('..') || trimmed.includes('\\')) return null;
    return trimmed;
  }

  // Block other relative paths (e.g., /api/posts, /api/comments)
  if (trimmed.startsWith('/')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'blob:') return trimmed;
    if (parsed.protocol === 'https:') {
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'googleusercontent.com' ||
        host.endsWith('.googleusercontent.com') ||
        host === 'ggpht.com' ||
        host.endsWith('.ggpht.com') ||
        host === 'firebasestorage.googleapis.com' ||
        host === 'avatars.githubusercontent.com' ||
        host === 'qpi.digital' ||
        host.endsWith('.qpi.digital') ||
        host === 'knoblab.xyz' ||
        host.endsWith('.knoblab.xyz') ||
        host === 'knoblab.digital' ||
        host.endsWith('.knoblab.digital') ||
        host === 'cnsh.life' ||
        host.endsWith('.cnsh.life') ||
        host === 'cnsh.space' ||
        host.endsWith('.cnsh.space')
      ) {
        return parsed.toString();
      }
    }
  } catch {
    return null;
  }

  return null;
}

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  size = 20,
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  const initial = (name || 'U').trim()[0]?.toUpperCase() || 'U';
  const safeSrc = getSafeAvatarUrl(src);

  if (safeSrc && !hasError) {
    return (
      <img
        src={safeSrc}
        alt={name || '프로필 사진'}
        className={`user-avatar-img ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid var(--color-silver)',
          flexShrink: 0,
          display: 'block',
        }}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <span
      className={`user-avatar-fallback ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: 'var(--color-black)',
        color: 'var(--color-paper)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.max(9, Math.floor(size * 0.48))}px`,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        lineHeight: 1,
        userSelect: 'none',
      }}
      title={name || '사용자 프로필'}
    >
      {initial}
    </span>
  );
};

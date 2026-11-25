import React from 'react';
import { getMemberGenerationLabel } from '../../utils/member';

interface AuthorBadgeProps {
  userId?: string | null;
  email?: string | null;
  generation?: string | null;
  style?: React.CSSProperties;
  size?: number;
}

export const VerifiedCheckBadge: React.FC<{
  color?: string;
  title?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({
  color = 'var(--color-celadon)',
  title = '관리자 인증',
  size = 14,
  style,
}) => (
  <span
    title={title}
    aria-label={title}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      verticalAlign: 'middle',
      lineHeight: 1,
      flexShrink: 0,
      marginLeft: '2px',
      ...style,
    }}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <circle cx="12" cy="12" r="10" fill={color} />
      <path
        d="M8.5 12.5L11 15L16 9.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export const AuthorBadge: React.FC<AuthorBadgeProps> = ({ userId, email, generation, style, size = 14 }) => {
  // AI Assistant badge strictly for verified asterisk bot UID
  if (userId === 'asterisk-ai-bot') {
    return (
      <span
        title="asterisk AI (Gemma 4 31B)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '1px 6px',
          borderRadius: 'var(--radius-md)',
          fontSize: '10.5px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          backgroundColor: 'var(--color-red-bg)',
          color: 'var(--color-functional-red)',
          border: '1px solid var(--color-red-border)',
          lineHeight: 1.3,
          ...style,
        }}
      >
        AI
      </span>
    );
  }

  // Server-computed privilege & verification badges
  if (generation === 'ORANGE_ADMIN') {
    return <VerifiedCheckBadge color="var(--color-persimmon)" title="특별 관리자 인증" size={size} style={style} />;
  }

  if (generation === 'PRESIDENT' || generation === 'STUDENT_PRESIDENT') {
    return <VerifiedCheckBadge color="var(--color-celadon)" title="전교회장 인증" size={size} style={style} />;
  }

  if (generation === 'ADMIN' || generation === 'VERIFIED') {
    return <VerifiedCheckBadge color="var(--color-celadon)" title="관리자 인증" size={size} style={style} />;
  }

  const label = (generation && generation !== 'AI' ? generation : null) || getMemberGenerationLabel(email, userId);
  if (!label) return null;

  return (
    <span className="author-generation-badge pdf-generation-badge" style={style}>
      {label}
    </span>
  );
};

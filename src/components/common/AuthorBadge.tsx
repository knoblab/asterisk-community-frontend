import React from 'react';
import { getMemberGenerationLabel, isSpecialOrangeAdmin, isStudentCouncilPresident } from '../../utils/member';
import { isAdminUser } from '../../constants/admin';

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
  color = '#2563EB',
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
  // AI Assistant badge for asterisk bot
  if (userId === 'asterisk-ai-bot' || generation === 'AI') {
    return (
      <span
        title="asterisk AI (Gemma 4 31B)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '1px 6px',
          borderRadius: '4px',
          fontSize: '10.5px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          backgroundColor: 'rgba(229, 57, 53, 0.14)',
          color: 'var(--color-functional-red)',
          border: '1px solid rgba(229, 57, 53, 0.35)',
          lineHeight: 1.3,
          ...style,
        }}
      >
        AI
      </span>
    );
  }

  // Explicit Blue Badge for 3BKU2q6GIVg0cgFkM2t238ZE8Zf1 (even if legacy comments have generation === 'ORANGE_ADMIN')
  if (userId === '3BKU2q6GIVg0cgFkM2t238ZE8Zf1') {
    return <VerifiedCheckBadge color="#2563EB" title="관리자 인증" size={size} style={style} />;
  }

  // Special orange badge for a66792427@gmail.com
  if (isSpecialOrangeAdmin(email, userId) || generation === 'ORANGE_ADMIN') {
    return <VerifiedCheckBadge color="#F97316" title="특별 관리자 인증" size={size} style={style} />;
  }

  // Student Council President blue check badge for cnsh32_1218@g.cnees.kr
  if (isStudentCouncilPresident(email, userId) || generation === 'PRESIDENT' || generation === 'STUDENT_PRESIDENT') {
    return <VerifiedCheckBadge color="#2563EB" title="전교회장 인증" size={size} style={style} />;
  }

  // Standard blue badge for other admins
  if (isAdminUser(userId, email) || generation === 'ADMIN' || generation === 'VERIFIED') {
    return <VerifiedCheckBadge color="#2563EB" title="관리자 인증" size={size} style={style} />;
  }

  const label = generation || getMemberGenerationLabel(email, userId);
  if (!label) return null;

  return (
    <span className="author-generation-badge pdf-generation-badge" style={style}>
      {label}
    </span>
  );
};

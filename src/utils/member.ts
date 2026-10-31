const MEMBER_EMAIL_PATTERN = /^cnsh(\d{2})_\d{4}@(?:g\.cnees\.kr|cnsh\.hs\.kr)$/i;
const MASKED_OR_RAW_MEMBER_EMAIL_PATTERN = /^cnsh(\d{2})_(?:\d{4}|\*{4})@(?:g\.cnees\.kr|cnsh\.hs\.kr)$/i;
import { isAdminUser } from '../constants/admin';

export const isSpecialOrangeAdmin = (email?: string | null, uid?: string | null) => {
  if (uid === '3BKU2q6GIVg0cgFkM2t238ZE8Zf1') return false;
  if (uid === 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2' || uid === 'uIwnm9R1fbZdIadTwqZJupiCkKN2') return true;
  if (email && email.trim().toLowerCase() === 'a66792427@gmail.com') return true;
  return false;
};

export const isStudentCouncilPresident = (email?: string | null, _uid?: string | null) => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const presidentEmail = (import.meta.env.VITE_STUDENT_PRESIDENT_EMAIL || 'cnsh32_1218@g.cnees.kr').toLowerCase();
  return (
    normalized === presidentEmail ||
    normalized === presidentEmail.replace('@g.cnees.kr', '@cnsh.hs.kr')
  );
};

export const isAllowedMemberEmail = (email?: string | null, uid?: string | null) => {
  if (!email && !uid) return false;
  if (isAdminUser(uid, email)) return true;
  return email ? MEMBER_EMAIL_PATTERN.test(email.trim()) : false;
};

export const getMemberGenerationLabel = (email?: string | null, uid?: string | null) => {
  if (isAdminUser(uid, email)) return null;
  if (!email) return null;
  const match = email.trim().match(MASKED_OR_RAW_MEMBER_EMAIL_PATTERN);
  return match ? `${Number(match[1])}기` : null;
};

export const canWriteContent = (uid?: string | null, email?: string | null) => {
  if (isAdminUser(uid, email)) return true;
  return isAllowedMemberEmail(email, uid);
};

export const formatAuthorName = (author?: string | null, email?: string | null) => {
  const trimmed = author?.trim();
  if (trimmed && trimmed !== '익명' && !trimmed.startsWith('익명')) {
    const match = trimmed.match(/^cnsh(\d{2})_(?:\d{4}|\*{4})$/i);
    if (match) {
      return `${Number(match[1])}기 ****`;
    }
    return trimmed;
  }
  if (email && email.includes('@')) {
    const prefix = email.split('@')[0];
    const match = prefix.match(/^cnsh(\d{2})_(?:\d{4}|\*{4})$/i);
    if (match) {
      return `${Number(match[1])}기 ****`;
    }
    return prefix;
  }
  return trimmed && trimmed !== '익명' ? trimmed : '회원';
};

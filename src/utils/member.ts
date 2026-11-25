import { isAdminUser } from '../constants/admin';
import type { KnoblabUser } from '../types';

const MEMBER_EMAIL_PATTERN = /^cnsh(\d{2})_\d{4}@(?:g\.cnees\.kr|cnsh\.hs\.kr)$/i;
const MASKED_OR_RAW_MEMBER_EMAIL_PATTERN = /^cnsh(\d{2})_(?:\d{4}|\*{4})@(?:g\.cnees\.kr|cnsh\.hs\.kr)$/i;

export const isSchoolEmailRestricted = (): boolean => {
  const restrictedFlag = import.meta.env?.VITE_RESTRICT_SCHOOL_EMAIL;
  if (restrictedFlag === 'false' || import.meta.env?.VITE_ALLOW_ALL_EMAILS === 'true') {
    return false;
  }
  return true;
};

export const isSpecialOrangeAdmin = (
  userOrEmail?: Partial<KnoblabUser> | string | null,
  _uid?: string | null,
  generation?: string | null
): boolean => {
  if (userOrEmail && typeof userOrEmail === 'object') {
    return Boolean(userOrEmail.isSpecialOrangeAdmin === true || userOrEmail.roleBadge === 'ORANGE_ADMIN');
  }
  return generation === 'ORANGE_ADMIN';
};

export const isStudentCouncilPresident = (
  userOrEmail?: Partial<KnoblabUser> | string | null,
  _uid?: string | null,
  generation?: string | null
): boolean => {
  if (userOrEmail && typeof userOrEmail === 'object') {
    return Boolean(
      userOrEmail.isStudentCouncilPresident === true ||
        userOrEmail.roleBadge === 'PRESIDENT' ||
        userOrEmail.roleBadge === 'STUDENT_PRESIDENT'
    );
  }
  return generation === 'PRESIDENT' || generation === 'STUDENT_PRESIDENT';
};

export const isAllowedMemberEmail = (
  email?: string | null,
  uid?: string | null,
  isAdminFlag = false
): boolean => {
  if (!email && !uid) return false;
  if (isAdminFlag || isAdminUser(uid, email)) return true;
  if (!isSchoolEmailRestricted()) {
    return Boolean(email && email.includes('@'));
  }
  return email ? MEMBER_EMAIL_PATTERN.test(email.trim()) : false;
};

export const getMemberGenerationLabel = (
  email?: string | null,
  uid?: string | null,
  isAdminFlag = false
): string | null => {
  if (isAdminFlag || isAdminUser(uid, email)) return null;
  if (!email) return null;
  const match = email.trim().match(MASKED_OR_RAW_MEMBER_EMAIL_PATTERN);
  return match ? `${Number(match[1])}기` : null;
};

export const canWriteContent = (
  userOrUid?: Partial<KnoblabUser> | string | null,
  email?: string | null,
  isAdminFlag = false
): boolean => {
  if (userOrUid && typeof userOrUid === 'object') {
    if (isAdminUser(userOrUid)) return true;
    return isAllowedMemberEmail(userOrUid.email, userOrUid.uid, Boolean(userOrUid.isAdmin));
  }
  if (isAdminFlag || isAdminUser(userOrUid, email)) return true;
  return isAllowedMemberEmail(email, userOrUid, isAdminFlag);
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

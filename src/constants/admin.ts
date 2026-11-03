export const ADMIN_UID = import.meta.env.VITE_ADMIN_UID || 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2';
export const DEFAULT_ADMIN_UIDS: string[] = [
  '3BKU2q6GIVg0cgFkM2t238ZE8Zf1',
  'gXPUzH8sZAfLKcGnQPmoXrQkxWY2',
  'uIwnm9R1fbZdIadTwqZJupiCkKN2',
];

export const ADMIN_EMAILS: string[] = [
  'a66792427@gmail.com',
  (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase(),
].filter(Boolean);

export const ADMIN_EMAIL = ADMIN_EMAILS[0] || '';

export const isAdminUser = (
  uid?: string | null,
  email?: string | null,
  customClaims?: Record<string, any>
): boolean => {
  if (customClaims?.admin === true) return true;

  // 1. 공인 관리자 UID 일치 확인 (가장 높은 신뢰도)
  if (uid && (uid === ADMIN_UID || DEFAULT_ADMIN_UIDS.includes(uid))) {
    return true;
  }

  // 2. 공인 관리자 이메일 일치 확인
  if (email) {
    const normalized = email.trim().toLowerCase();
    if (ADMIN_EMAILS.includes(normalized)) {
      return true;
    }
  }

  return false;
};

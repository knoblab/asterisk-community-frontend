import type { KnoblabUser } from '../types';

export const ADMIN_UID = '';
export const DEFAULT_ADMIN_UIDS: string[] = [];
export const ADMIN_EMAILS: string[] = [];
export const ADMIN_EMAIL = '';

export const isAdminUser = (
  userOrUid?: Partial<KnoblabUser> | string | null,
  _email?: string | null,
  customClaimsOrRole?: Record<string, unknown> | string | null
): boolean => {
  if (userOrUid && typeof userOrUid === 'object') {
    return Boolean(
      userOrUid.isAdmin === true ||
        userOrUid.roleBadge === 'ADMIN' ||
        userOrUid.roleBadge === 'ORANGE_ADMIN'
    );
  }
  if (typeof customClaimsOrRole === 'string') {
    return customClaimsOrRole === 'ADMIN' || customClaimsOrRole === 'ORANGE_ADMIN';
  }
  if (customClaimsOrRole && typeof customClaimsOrRole === 'object') {
    return Boolean(customClaimsOrRole.admin === true || customClaimsOrRole.isAdmin === true);
  }
  return false;
};

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAllowedMemberEmail, isSchoolEmailRestricted } from '../utils/member';

describe('School Email Restriction & Google Review Mode Toggle Tests', () => {
  const originalEnv = import.meta.env.VITE_RESTRICT_SCHOOL_EMAIL;

  afterEach(() => {
    // Restore original env
    (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Production Mode (RESTRICT_SCHOOL_EMAIL=true)', () => {
    beforeEach(() => {
      (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL = 'true';
    });

    it('identifies school email restriction as enabled', () => {
      expect(isSchoolEmailRestricted()).toBe(true);
    });

    it('allows valid school emails (@g.cnees.kr, @cnsh.hs.kr)', () => {
      expect(isAllowedMemberEmail('cnsh32_1218@g.cnees.kr', 'uid-1')).toBe(true);
      expect(isAllowedMemberEmail('cnsh31_0001@cnsh.hs.kr', 'uid-2')).toBe(true);
    });

    it('blocks regular non-school google accounts (@gmail.com)', () => {
      expect(isAllowedMemberEmail('reviewer@gmail.com', 'uid-reviewer')).toBe(false);
      expect(isAllowedMemberEmail('testuser@example.com', 'uid-test')).toBe(false);
    });

    it('still allows admin accounts', () => {
      expect(isAllowedMemberEmail('a66792427@gmail.com', 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2')).toBe(true);
    });
  });

  describe('2. Review / Test Mode (RESTRICT_SCHOOL_EMAIL=false)', () => {
    beforeEach(() => {
      (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL = 'false';
    });

    it('identifies school email restriction as disabled', () => {
      expect(isSchoolEmailRestricted()).toBe(false);
    });

    it('allows valid non-school Google reviewer emails (@gmail.com)', () => {
      expect(isAllowedMemberEmail('google-reviewer@gmail.com', 'uid-google')).toBe(true);
      expect(isAllowedMemberEmail('app-tester-123@gmail.com', 'uid-tester')).toBe(true);
    });

    it('still allows school emails in test mode', () => {
      expect(isAllowedMemberEmail('cnsh32_1218@g.cnees.kr', 'uid-student')).toBe(true);
    });

    it('rejects null or invalid non-email identifiers', () => {
      expect(isAllowedMemberEmail(null, null)).toBe(false);
      expect(isAllowedMemberEmail('', null)).toBe(false);
      expect(isAllowedMemberEmail('not-an-email', 'uid-invalid')).toBe(false);
    });
  });
});

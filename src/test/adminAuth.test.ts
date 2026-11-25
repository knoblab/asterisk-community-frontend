import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { isAdminUser, DEFAULT_ADMIN_UIDS, ADMIN_EMAILS } from '../constants/admin';
import {
  isAllowedMemberEmail,
  isSpecialOrangeAdmin,
  isStudentCouncilPresident,
  getMemberGenerationLabel,
} from '../utils/member';
import { AuthorBadge } from '../components/common/AuthorBadge';

describe('Admin Authentication & Server-Driven Authorization Logic', () => {
  it('removes hardcoded admin/president UIDs and emails from frontend source files (F-31)', () => {
    expect(DEFAULT_ADMIN_UIDS).toEqual([]);
    expect(ADMIN_EMAILS).toEqual([]);
    const adminSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/constants/admin.ts'), 'utf-8');
    const memberSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/member.ts'), 'utf-8');
    for (const secretIdent of [
      'gXPUzH8sZAfLKcGnQPmoXrQkxWY2',
      '3BKU2q6GIVg0cgFkM2t238ZE8Zf1',
      'uIwnm9R1fbZdIadTwqZJupiCkKN2',
      'a66792427@gmail.com',
      'cnsh32_1218@g.cnees.kr',
    ]) {
      expect(adminSrc).not.toContain(secretIdent);
      expect(memberSrc).not.toContain(secretIdent);
    }
  });

  it('identifies admins strictly from server-derived user flags or claims', () => {
    expect(isAdminUser({ uid: 'admin-1', isAdmin: true })).toBe(true);
    expect(isAdminUser({ uid: 'admin-2', roleBadge: 'ORANGE_ADMIN' })).toBe(true);
    expect(isAdminUser('admin-1', 'user@example.com', 'ADMIN')).toBe(true);
    expect(isAdminUser('admin-1', 'user@example.com', { isAdmin: true })).toBe(true);
    expect(isAdminUser('random-uid', 'attacker@gmail.com')).toBe(false);
    expect(isAdminUser(null, null)).toBe(false);
  });

  it('allows non-school email in isAllowedMemberEmail only when server isAdmin flag is true', () => {
    const originalEnv = (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL;
    (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL = 'true';
    try {
      expect(isAllowedMemberEmail('attacker@gmail.com', 'random-uid')).toBe(false);
      expect(isAllowedMemberEmail('cnsh32_1218@g.cnees.kr', 'student-uid')).toBe(true);
      expect(isAllowedMemberEmail('cnsh32_****@g.cnees.kr', 'student-uid')).toBe(false);
      expect(isAllowedMemberEmail('admin-external@gmail.com', 'admin-uid', true)).toBe(true);
      expect(isAllowedMemberEmail('admin-external@gmail.com', 'admin-uid', false)).toBe(false);
    } finally {
      (import.meta.env as Record<string, unknown>).VITE_RESTRICT_SCHOOL_EMAIL = originalEnv;
    }
  });

  it('extracts student generation label from both raw and server-masked school emails', () => {
    expect(getMemberGenerationLabel('cnsh32_1234@g.cnees.kr', 'student-uid')).toBe('32기');
    expect(getMemberGenerationLabel('cnsh33_****@g.cnees.kr', 'student-uid')).toBe('33기');
    expect(getMemberGenerationLabel('cnsh31_****@cnsh.hs.kr', 'student-uid')).toBe('31기');
  });

  it('evaluates orange admin and student council president flags from server role badges/flags', () => {
    expect(isSpecialOrangeAdmin({ isSpecialOrangeAdmin: true })).toBe(true);
    expect(isSpecialOrangeAdmin(null, null, 'ORANGE_ADMIN')).toBe(true);
    expect(isSpecialOrangeAdmin(null, null, 'ADMIN')).toBe(false);
    expect(isStudentCouncilPresident({ isStudentCouncilPresident: true })).toBe(true);
    expect(isStudentCouncilPresident(null, null, 'PRESIDENT')).toBe(true);
    expect(isStudentCouncilPresident(null, null, '32기')).toBe(false);
  });

  it('renders AuthorBadge colors strictly from server-computed generation', () => {
    const { container: blueBadgeContainer } = render(
      React.createElement(AuthorBadge, {
        userId: 'user-admin',
        generation: 'ADMIN',
      })
    );
    expect(blueBadgeContainer.querySelector('circle')?.getAttribute('fill')).toBe('var(--color-celadon)');

    const { container: orangeBadgeContainer } = render(
      React.createElement(AuthorBadge, {
        userId: 'user-orange',
        generation: 'ORANGE_ADMIN',
      })
    );
    expect(orangeBadgeContainer.querySelector('circle')?.getAttribute('fill')).toBe('var(--color-persimmon)');

    const { container: spoofedAiContainer } = render(
      React.createElement(AuthorBadge, {
        userId: 'regular-user-uid',
        generation: 'AI',
      })
    );
    expect(spoofedAiContainer.textContent).not.toBe('AI');
  });

  it('renders student generation badge when email is masked by backend', () => {
    const { container } = render(
      React.createElement(AuthorBadge, {
        userId: 'student-1',
        email: 'cnsh32_****@g.cnees.kr',
      })
    );
    expect(container.textContent).toBe('32기');
  });
});

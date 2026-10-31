import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { isAdminUser } from '../constants/admin';
import { isAllowedMemberEmail, isSpecialOrangeAdmin, getMemberGenerationLabel } from '../utils/member';
import { AuthorBadge } from '../components/common/AuthorBadge';

describe('Admin Authentication & Authorization Logic', () => {
  const adminUid = 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2';
  const adminEmail = 'a66792427@gmail.com';

  it('correctly identifies admin by UID', () => {
    expect(isAdminUser(adminUid, null)).toBe(true);
    expect(isAdminUser('3BKU2q6GIVg0cgFkM2t238ZE8Zf1', null)).toBe(true);
    expect(isAdminUser(adminUid, 'random@example.com')).toBe(true);
    expect(isAdminUser('uIwnm9R1fbZdIadTwqZJupiCkKN2', null)).toBe(true);
  });

  it('correctly identifies admin by Email (case insensitive)', () => {
    expect(isAdminUser('some-random-uid', adminEmail)).toBe(true);
    expect(isAdminUser('some-random-uid', 'A66792427@GMAIL.COM')).toBe(true);
    expect(isAdminUser(null, adminEmail)).toBe(true);
  });

  it('rejects non-admin credentials', () => {
    expect(isAdminUser('random-uid', 'attacker@gmail.com')).toBe(false);
    expect(isAdminUser(null, null)).toBe(false);
  });

  it('allows admin email in isAllowedMemberEmail without school domain requirement', () => {
    // Non-school regular email must be rejected
    expect(isAllowedMemberEmail('attacker@gmail.com', 'random-uid')).toBe(false);

    // School domain emails must be accepted
    expect(isAllowedMemberEmail('cnsh32_1218@g.cnees.kr', 'student-uid')).toBe(true);

    // Masked emails must not pass raw member login validation
    expect(isAllowedMemberEmail('cnsh32_****@g.cnees.kr', 'student-uid')).toBe(false);

    // Admin email MUST be allowed even with gmail.com domain
    expect(isAllowedMemberEmail(adminEmail, adminUid)).toBe(true);
    expect(isAllowedMemberEmail(adminEmail, 'temporary-uid')).toBe(true);
  });

  it('extracts student generation label from both raw and server-masked school emails', () => {
    expect(getMemberGenerationLabel('cnsh32_1234@g.cnees.kr', 'student-uid')).toBe('32기');
    expect(getMemberGenerationLabel('cnsh33_****@g.cnees.kr', 'student-uid')).toBe('33기');
    expect(getMemberGenerationLabel('cnsh31_****@cnsh.hs.kr', 'student-uid')).toBe('31기');
  });

  it('grants special orange badge to the admin account, but NOT to 3BKU2q6GIVg0cgFkM2t238ZE8Zf1', () => {
    expect(isSpecialOrangeAdmin(adminEmail, adminUid)).toBe(true);
    expect(isSpecialOrangeAdmin(null, adminUid)).toBe(true);
    expect(isSpecialOrangeAdmin(adminEmail, null)).toBe(true);
    expect(isSpecialOrangeAdmin(null, '3BKU2q6GIVg0cgFkM2t238ZE8Zf1')).toBe(false);
    expect(isSpecialOrangeAdmin('other@gmail.com', 'other-uid')).toBe(false);
  });

  it('renders blue badge for 3BKU2q6GIVg0cgFkM2t238ZE8Zf1 even when legacy generation is ORANGE_ADMIN', () => {
    const { container: blueBadgeContainer } = render(
      React.createElement(AuthorBadge, {
        userId: '3BKU2q6GIVg0cgFkM2t238ZE8Zf1',
        generation: 'ORANGE_ADMIN',
      })
    );
    const circle = blueBadgeContainer.querySelector('circle');
    expect(circle).toBeTruthy();
    expect(circle?.getAttribute('fill')).toBe('#2563EB'); // Blue

    const { container: orangeBadgeContainer } = render(
      React.createElement(AuthorBadge, {
        userId: 'gXPUzH8sZAfLKcGnQPmoXrQkxWY2',
        generation: 'ORANGE_ADMIN',
      })
    );
    const orangeCircle = orangeBadgeContainer.querySelector('circle');
    expect(orangeCircle).toBeTruthy();
    expect(orangeCircle?.getAttribute('fill')).toBe('#F97316'); // Orange
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

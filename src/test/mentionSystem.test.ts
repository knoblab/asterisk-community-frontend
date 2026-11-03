import { describe, it, expect } from 'vitest';
import {
  REGISTERED_MENTIONS,
  getKnownMention,
  isKnownMention,
  filterMentions,
  registerMention,
} from '../constants/mentions';

describe('Extensible Mention System', () => {
  it('has default registered @asterisk AI bot mention', () => {
    const asterisk = getKnownMention('@asterisk');
    expect(asterisk).toBeDefined();
    expect(asterisk?.id).toBe('asterisk');
    expect(asterisk?.handle).toBe('@asterisk');
    expect(asterisk?.type).toBe('bot');
    expect(isKnownMention('@asterisk')).toBe(true);
    expect(isKnownMention('asterisk')).toBe(true);
  });

  it('correctly reports unknown mentions as false', () => {
    expect(isKnownMention('@unknown')).toBe(false);
    expect(isKnownMention('@foobar')).toBe(false);
    expect(isKnownMention('')).toBe(false);
    expect(isKnownMention(undefined)).toBe(false);
  });

  it('filters mentions by typed query', () => {
    expect(filterMentions('')).toEqual(REGISTERED_MENTIONS);
    expect(filterMentions('@')).toEqual(REGISTERED_MENTIONS);
    expect(filterMentions('ast').some((m) => m.id === 'asterisk')).toBe(true);
    expect(filterMentions('@asterisk').some((m) => m.id === 'asterisk')).toBe(true);
    expect(filterMentions('nonexistent')).toHaveLength(0);
  });

  it('allows dynamic registration of future mentions', () => {
    registerMention({
      id: 'admin_test',
      handle: '@admin_test',
      name: '테스트 관리자',
      description: '운영진 공지 전용',
      type: 'role',
      badge: 'Admin',
    });

    expect(isKnownMention('@admin_test')).toBe(true);
    const found = getKnownMention('@admin_test');
    expect(found?.name).toBe('테스트 관리자');
    expect(filterMentions('admin_test')).toContainEqual(found);
  });

  it('checks enablement dynamically for @asterisk depending on aiEnabled flag', () => {
    const asterisk = getKnownMention('@asterisk');
    expect(asterisk?.checkEnabled).toBeDefined();

    const enabledResult = asterisk!.checkEnabled!({ aiEnabled: true });
    expect(enabledResult.enabled).toBe(true);

    const disabledResult = asterisk!.checkEnabled!({ aiEnabled: false });
    expect(disabledResult.enabled).toBe(false);
    expect(disabledResult.disabledMessage).toBe('준비중인 기능입니다');
  });
});

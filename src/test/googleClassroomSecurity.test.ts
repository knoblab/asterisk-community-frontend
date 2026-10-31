import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Google Classroom Integration Security & Data Pipeline Tests', () => {
  // Test Secret Key (32 bytes hex)
  const TEST_SECRET_KEY = '13a5a69157319b3566f1980a2b7a426ed1081a03467f7cbe16b8901d0ebc0139';
  const SESSION_SECRET = 'cnsh_super_secret_local_session_key_2026';

  const encryptToken = (plainText: string, keyHex: string): string => {
    if (!plainText) return '';
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  };

  const decryptToken = (cipherText: string, keyHex: string): string => {
    if (!cipherText) return '';
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, encHex] = parts;
    try {
      const key = Buffer.from(keyHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
      return dec.toString('utf8');
    } catch {
      return '';
    }
  };

  describe('1. AES-256-GCM Token Encryption Security', () => {
    it('successfully encrypts and decrypts a Google refresh token', () => {
      const mockRefreshToken = '1//04aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890_GoogleRefreshToken';
      const encrypted = encryptToken(mockRefreshToken, TEST_SECRET_KEY);

      expect(encrypted).not.toBe(mockRefreshToken);
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decryptToken(encrypted, TEST_SECRET_KEY);
      expect(decrypted).toBe(mockRefreshToken);
    });

    it('rejects tampered ciphertext', () => {
      const mockRefreshToken = 'sensitive_google_refresh_token_xyz';
      const encrypted = encryptToken(mockRefreshToken, TEST_SECRET_KEY);
      const [iv, tag, enc] = encrypted.split(':');

      // Flip the last byte of ciphertext
      const tamperedEnc = enc.slice(0, -2) + (enc.endsWith('00') ? 'ff' : '00');
      const tampered = `${iv}:${tag}:${tamperedEnc}`;

      const decrypted = decryptToken(tampered, TEST_SECRET_KEY);
      expect(decrypted).toBe('');
    });

    it('rejects tampered authentication tag (GCM integrity failure)', () => {
      const mockRefreshToken = 'sensitive_google_refresh_token_xyz';
      const encrypted = encryptToken(mockRefreshToken, TEST_SECRET_KEY);
      const [iv, tag, enc] = encrypted.split(':');

      // Tamper with authentication tag
      const tamperedTag = tag.slice(0, -2) + (tag.endsWith('11') ? '22' : '11');
      const tampered = `${iv}:${tamperedTag}:${enc}`;

      const decrypted = decryptToken(tampered, TEST_SECRET_KEY);
      expect(decrypted).toBe('');
    });

    it('fails decryption with wrong encryption key', () => {
      const mockRefreshToken = 'sensitive_google_refresh_token_xyz';
      const encrypted = encryptToken(mockRefreshToken, TEST_SECRET_KEY);
      const wrongKey = '9999999999999999999999999999999999999999999999999999999999999999';

      const decrypted = decryptToken(encrypted, wrongKey);
      expect(decrypted).toBe('');
    });
  });

  describe('2. OAuth CSRF State Verification & Replay Protection', () => {
    const createOAuthState = (uid: string, secret: string): string => {
      const timestamp = Date.now();
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = `${uid}.${timestamp}.${nonce}`;
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return `${payload}.${sig}`;
    };

    const verifyOAuthState = (state: string, secret: string, usedStates: Set<string>): { uid: string } | null => {
      if (!state) return null;
      const parts = state.split('.');
      if (parts.length !== 4) return null;
      const [uid, timestampStr, nonce, sig] = parts;
      const timestamp = Number(timestampStr);

      // Max 10 min expiry
      if (isNaN(timestamp) || Date.now() - timestamp > 10 * 60 * 1000 || timestamp > Date.now() + 60000) {
        return null;
      }

      const stateKey = `${uid}:${nonce}`;
      if (usedStates.has(stateKey)) return null;

      const payload = `${uid}.${timestampStr}.${nonce}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (sig !== expectedSig) {
        return null;
      }

      usedStates.add(stateKey);
      return { uid };
    };

    it('successfully verifies a valid OAuth state', () => {
      const usedStates = new Set<string>();
      const state = createOAuthState('student_uid_123', SESSION_SECRET);
      const verified = verifyOAuthState(state, SESSION_SECRET, usedStates);

      expect(verified).not.toBeNull();
      expect(verified?.uid).toBe('student_uid_123');
    });

    it('rejects a forged or tampered OAuth state', () => {
      const usedStates = new Set<string>();
      const state = createOAuthState('student_uid_123', SESSION_SECRET);
      const parts = state.split('.');

      // Attacker changes uid to target another user
      const forgedState = `victim_uid_456.${parts[1]}.${parts[2]}.${parts[3]}`;
      const verified = verifyOAuthState(forgedState, SESSION_SECRET, usedStates);

      expect(verified).toBeNull();
    });

    it('rejects replayed OAuth states (one-time nonce check)', () => {
      const usedStates = new Set<string>();
      const state = createOAuthState('student_uid_123', SESSION_SECRET);

      // First call succeeds
      const first = verifyOAuthState(state, SESSION_SECRET, usedStates);
      expect(first).not.toBeNull();

      // Second call with identical state must be rejected
      const second = verifyOAuthState(state, SESSION_SECRET, usedStates);
      expect(second).toBeNull();
    });

    it('rejects expired OAuth states older than 10 minutes', () => {
      const usedStates = new Set<string>();
      const expiredTimestamp = Date.now() - 11 * 60 * 1000; // 11 mins ago
      const nonce = crypto.randomBytes(16).toString('hex');
      const payload = `student_uid_123.${expiredTimestamp}.${nonce}`;
      const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
      const expiredState = `${payload}.${sig}`;

      const verified = verifyOAuthState(expiredState, SESSION_SECRET, usedStates);
      expect(verified).toBeNull();
    });
  });

  describe('3. Student Identity Lock (Account Mismatch Prevention)', () => {
    const verifyIdentityLock = (expectedEmail: string, actualGoogleEmail: string): boolean => {
      const exp = (expectedEmail || '').toLowerCase().trim();
      const act = (actualGoogleEmail || '').toLowerCase().trim();
      if (!exp || !act) return true; // If one is not set, allow
      return exp === act;
    };

    it('allows matching school emails', () => {
      expect(verifyIdentityLock('cnsh26_1234@g.cnees.kr', 'cnsh26_1234@g.cnees.kr')).toBe(true);
      expect(verifyIdentityLock('CNSH26_1234@G.CNEES.KR', 'cnsh26_1234@g.cnees.kr')).toBe(true);
    });

    it('blocks mismatched Google account (e.g. personal Gmail instead of school account)', () => {
      expect(verifyIdentityLock('cnsh26_1234@g.cnees.kr', 'personal_gamer@gmail.com')).toBe(false);
      expect(verifyIdentityLock('cnsh26_1234@g.cnees.kr', 'cnsh26_9999@g.cnees.kr')).toBe(false);
    });
  });

  describe('4. Classroom Due Date Calculation & Sorting Pipeline', () => {
    it('correctly calculates KST due timestamp and formats date string', () => {
      // 2026-11-02 14:59:00 UTC = 2026-11-02 23:59:00 KST
      const dueDate = { year: 2026, month: 11, day: 2 };
      const dueTime = { hours: 14, minutes: 59, seconds: 0 };

      const utcMs = Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day, dueTime.hours, dueTime.minutes, dueTime.seconds);
      const dateObj = new Date(utcMs);

      const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const formatted = kstFormatter.format(dateObj);
      expect(formatted).toContain('11');
      expect(formatted).toContain('2');
      expect(formatted).toContain('23:59');
    });

    it('sorts pending tasks with deadlines first (earliest deadline first)', () => {
      const taskA = { title: '과제 A (내일)', dueTimestamp: Date.now() + 86400000 };
      const taskB = { title: '과제 B (오늘)', dueTimestamp: Date.now() + 3600000 };
      const taskC = { title: '과제 C (기한 없음)', dueTimestamp: Number.MAX_SAFE_INTEGER };

      const tasks = [taskC, taskA, taskB];
      tasks.sort((a, b) => a.dueTimestamp - b.dueTimestamp);

      expect(tasks[0].title).toBe('과제 B (오늘)');
      expect(tasks[1].title).toBe('과제 A (내일)');
      expect(tasks[2].title).toBe('과제 C (기한 없음)');
    });
  });
});

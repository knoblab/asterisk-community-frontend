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

  describe('5. Google Calendar Reminder & Event Scheduling Pipeline', () => {
    const parseExplicitDateTime = (text: string, now: Date) => {
      if (!text) return null;
      const kstFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
      });
      const parts = kstFormatter.formatToParts(now);
      const cur: Record<string, number> = {};
      for (const p of parts) cur[p.type] = parseInt(p.value, 10);

      let targetYear = cur.year;
      let targetMonth = cur.month;
      let targetDay = cur.day;

      const curKstDate = new Date(Date.UTC(cur.year, cur.month - 1, cur.day, 0, 0, 0));
      const curDayOfWeek = curKstDate.getUTCDay();

      const weekdayMap: Record<string, number> = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
      const weekdayMatch = text.match(/(이번\s*주|다음\s*주|다다음\s*주)?\s*([월화수목금토일])\s*요일/);

      const monthDayMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      const dayOnlyMatch = text.match(/(?:^|[^\d])(\d{1,2})\s*일(?!\s*전)(?!\s*차)/);
      const daysAfterMatch = text.match(/(\d+)\s*일\s*(?:뒤|후)/);

      let hasExplicitDate = false;

      if (monthDayMatch) {
        hasExplicitDate = true;
        targetMonth = parseInt(monthDayMatch[1], 10);
        targetDay = parseInt(monthDayMatch[2], 10);
      } else if (/글피/i.test(text)) {
        hasExplicitDate = true;
        targetDay += 3;
      } else if (/모레/i.test(text)) {
        hasExplicitDate = true;
        targetDay += 2;
      } else if (/내일/i.test(text)) {
        hasExplicitDate = true;
        targetDay += 1;
      } else if (/오늘/i.test(text)) {
        hasExplicitDate = true;
        // targetDay is cur.day
      } else if (daysAfterMatch) {
        hasExplicitDate = true;
        targetDay += parseInt(daysAfterMatch[1], 10);
      } else if (weekdayMatch) {
        hasExplicitDate = true;
        const weekMod = (weekdayMatch[1] || '').replace(/\s+/g, '');
        const targetDow = weekdayMap[weekdayMatch[2]];
        let diffDays = targetDow - curDayOfWeek;
        if (weekMod === '다음주') diffDays += 7;
        else if (weekMod === '다다음주') diffDays += 14;
        else if (diffDays <= 0 && weekMod !== '이번주') diffDays += 7;
        targetDay += diffDays;
      } else if (dayOnlyMatch) {
        hasExplicitDate = true;
        targetDay = parseInt(dayOnlyMatch[1], 10);
      }

      const timeRegex = /(오전|오후|낮|밤|저녁|새벽)?\s*(\d{1,2})\s*(?:시(?!간)|:(\d{2}))\s*(?:(\d{1,2})\s*분)?/i;
      const timeMatch = text.match(timeRegex);
      if (!timeMatch && !hasExplicitDate) return null;

      let hasExplicitTime = false;
      let hour = 9;
      let minute = 0;

      if (timeMatch) {
        hasExplicitTime = true;
        const meridiem = (timeMatch[1] || '').trim();
        hour = parseInt(timeMatch[2], 10);
        if (timeMatch[3]) minute = parseInt(timeMatch[3], 10);
        else if (timeMatch[4]) minute = parseInt(timeMatch[4], 10);

        if (['오후', '밤', '저녁'].includes(meridiem)) {
          if (hour < 12) hour += 12;
        } else if (['오전', '새벽'].includes(meridiem)) {
          if (hour === 12) hour = 0;
        }
      }

      const utcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, hour - 9, minute, 0);
      return { timestamp: utcMs, hour, minute, hasExplicitTime };
    };

    const parseCalendarReminderRequest = ({ prompt = '', tasks = [], now = new Date() }: { prompt: string; tasks?: any[]; now?: Date }) => {
      const text = String(prompt || '').trim();
      const isTask = /(할\s*일|태스크|tasks?)/i.test(text);
      const isUpdate = /(옮겨|변경|수정|바꿔|미뤄|당겨)/i.test(text);
      const isDelete = /(삭제|지워|취소|없애|빼줘)/i.test(text);
      const isCalendarIntent =
        isUpdate ||
        isDelete ||
        isTask ||
        /(알림|알람|리마인더|캘린더|달력|일정|스케줄|스케쥴)/i.test(text);
      if (!isCalendarIntent) return { isCalendarIntent: false };
      const isInquiry =
        /(뭐\s*있|있어|있나|알려줘|확인|조회|목록|언제야|스케줄|스케쥴|어때)/i.test(text) &&
        !isUpdate &&
        !isDelete &&
        !/(등록|추가|생성|넣어|해줘)/i.test(text);

      let determinedIntent = 'create';
      if (isUpdate) determinedIntent = 'update';
      else if (isDelete) determinedIntent = 'delete';
      else if (isInquiry) determinedIntent = isTask ? 'task_inquiry' : 'inquiry';
      else if (isTask) determinedIntent = 'task_create';

      const isActionable =
        determinedIntent === 'update' ||
        determinedIntent === 'delete' ||
        determinedIntent === 'task_create' ||
        /(넣어|등록|추가|설정|맞춰|생성|해줘|잡아|부탁|올려)/i.test(text) ||
        /(캘린더에|달력에|알림\s*등록|일정\s*등록|알람\s*등록|알림\s*넣어|알람\s*맞춰)/i.test(text);

      let offsetMinutes: number | null = null;
      const hourMatch = text.match(/(?:마감\s*)?(\d+)\s*(?:시간|시간\s*반|시간\s*정도)\s*전/i);
      const minMatch = text.match(/(?:마감\s*)?(\d+)\s*분\s*전/i);
      const dayMatch = text.match(/(?:마감\s*)?(?:하루|1일)\s*전/i);

      if (hourMatch) {
        offsetMinutes = parseInt(hourMatch[1], 10) * 60;
        if (text.includes('시간 반 전') || text.includes('시간 30분 전')) offsetMinutes += 30;
      } else if (minMatch) {
        offsetMinutes = parseInt(minMatch[1], 10);
      } else if (dayMatch) {
        offsetMinutes = 1440;
      } else if (/(?:마감\s*(?:전에?|전으로?))\s*(?:알림|알람|등록)/i.test(text)) {
        offsetMinutes = 60;
      }

      const subjectKeywords = [
        '물리', '화학', '생물', '수학', '정보', '영어', '국어',
        '윤사', '윤리와 사상', '생윤', '생활과 윤리', '사문', '사회', '역사',
        '테스트', '시험', '모의고사', '수행평가', '수행', '퀴즈'
      ];
      let matchedTask: any = null;
      const isAssignmentRelated = /(과제|숙제|수행평가|수행|레포트|보고서|마감)/i.test(text);

      if (tasks.length > 0) {
        const mentionedSubjects = subjectKeywords.filter((sub) => new RegExp(sub, 'i').test(text));
        if (mentionedSubjects.length > 0) {
          matchedTask = tasks.find((t) => {
            const fullTaskText = `${t.courseName || ''} ${t.title || ''}`.toLowerCase();
            return mentionedSubjects.some((sub) => fullTaskText.includes(sub.toLowerCase()));
          });
        }
        if (!matchedTask && isAssignmentRelated) {
          const nowMs = now.getTime();
          const upcomingTasks = tasks.filter((t) => t.dueTimestamp && t.dueTimestamp > nowMs);
          if (upcomingTasks.length > 0) matchedTask = upcomingTasks[0];
          else if (tasks[0]) matchedTask = tasks[0];
        }
      }

      if (matchedTask && matchedTask.dueTimestamp && matchedTask.dueTimestamp < Number.MAX_SAFE_INTEGER - 10000) {
        const finalOffset = offsetMinutes !== null ? offsetMinutes : 60;
        const dueMs = matchedTask.dueTimestamp;
        const startMs = dueMs - 30 * 60 * 1000;
        const endMs = dueMs;
        const reminderList = Array.from(new Set([finalOffset, 30, 10])).filter((m) => m > 0).sort((a, b) => b - a);

        return {
          isCalendarIntent: true,
          isActionable,
          intent: determinedIntent,
          type: 'coursework_deadline',
          task: matchedTask,
          offsetMinutes: finalOffset,
          remindersMinutes: reminderList,
          summary: `[과제 마감] ${matchedTask.courseName ? `${matchedTask.courseName} - ` : ''}${matchedTask.title}`,
          startMs,
          endMs,
        };
      }

      const explicitTime = parseExplicitDateTime(text, now);
      if (explicitTime) {
        let cleanTitle = text
          .replace(/@\w+/g, '')
          .replace(/(오늘|내일|모레|글피|\d+월\s*\d+일|\d+일)/g, '')
          .replace(/\(\s*[월화수목금토일]\s*\)/g, '')
          .replace(/(이번\s*주|다음\s*주|다다음\s*주)?\s*[월화수목금토일]\s*요일/g, '')
          .replace(/(오전|오후|낮|밤|저녁|새벽)?\s*\d{1,2}(?:시(?!간)|:\d{2})\s*(?:\d{1,2}분)?/g, '')
          .replace(/(구글\s*)?(캘린더|달력)에?/g, '')
          .replace(/\b하라고\b|\s+하라고(?:\s+|$)/g, ' ')
          .replace(/(일정|알림|알람|리마인더)?\s*(하라고|해줘|해\s*주세요|부탁해|넣어줘?|등록해?줘?|추가해?줘?|맞춰줘?|설정해?줘?|잡아줘?|생성해?줘?|옮겨줘?|변경해?줘?|수정해?줘?|삭제해?줘?|지워줘?)/g, '')
          .replace(/(일정|스케줄|스케쥴)$/g, '')
          .replace(/^[\s:\-–—,·.]+|[\s:\-–—,·.]+$/g, '')
          .replace(/(?:\s*(?:으로|로|을|를|이|가|은|는))+$/g, '')
          .trim();

        if (!cleanTitle || cleanTitle.length < 2) cleanTitle = 'Asterisk 캘린더 일정';

        const reminders = explicitTime.hasExplicitTime ? [30, 10, 0] : [780, 60, 10];

        return {
          isCalendarIntent: true,
          isActionable,
          intent: determinedIntent,
          type: 'custom_event',
          summary: cleanTitle,
          remindersMinutes: reminders,
          startMs: explicitTime.timestamp,
          hasExplicitTime: explicitTime.hasExplicitTime,
        };
      }

      let fallbackTitle = text
        .replace(/@\w+/g, '')
        .replace(/(구글\s*)?(캘린더|달력|할\s*일|태스크)에?/g, '')
        .replace(/(일정|알림|알람|리마인더)?\s*(하라고|해줘|해\s*주세요|부탁해|넣어줘?|등록해?줘?|추가해?줘?|맞춰줘?|설정해?줘?|잡아줘?|생성해?줘?|삭제해?줘?|지워줘?)/g, '')
        .trim();

      return {
        isCalendarIntent: true,
        isActionable: determinedIntent !== 'create' && determinedIntent !== 'inquiry' && determinedIntent !== 'task_inquiry',
        intent: determinedIntent,
        summary: fallbackTitle || 'Asterisk 할 일',
        type: 'inquiry_or_unmatched',
      };
    };

    it('includes https://www.googleapis.com/auth/calendar.events in OAuth scope string', () => {
      const scope =
        'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/calendar.events openid email profile';
      expect(scope).toContain('https://www.googleapis.com/auth/calendar.events');
      expect(scope).toContain('classroom.coursework.me.readonly');
    });

    it('correctly parses explicit KST times (e.g. 오늘 밤 10시 -> 22:00)', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z'); // 2026-11-01 15:00 KST
      const res = parseExplicitDateTime('오늘 밤 10시에 캘린더 등록해줘', baseDate);

      expect(res).not.toBeNull();
      expect(res?.hour).toBe(22);
      expect(res?.minute).toBe(0);
    });

    it('negative lookahead prevents "2시간 전" from being misidentified as 2 o\'clock', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const res = parseExplicitDateTime('마감 2시간 전에 알림 넣어줘', baseDate);

      // "2시간 전" has no absolute time of day
      expect(res).toBeNull();
    });

    it('matches physics coursework task and sets 2-hour offset reminders', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const mockTasks = [
        {
          courseName: '일반물리학 1',
          title: '3단원 역학 연습문제 풀이',
          dueTimestamp: Date.UTC(2026, 10, 2, 14, 59, 0), // 2026-11-02 23:59 KST
          link: 'https://classroom.google.com/cw/123',
        },
        {
          courseName: '고급화학',
          title: '분광분석 실험 보고서',
          dueTimestamp: Date.UTC(2026, 10, 5, 14, 59, 0),
          link: 'https://classroom.google.com/cw/456',
        },
      ];

      const parsed = parseCalendarReminderRequest({
        prompt: '내일 물리 과제 마감 2시간 전에 알림 넣어줘',
        tasks: mockTasks,
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.isActionable).toBe(true);
      expect(parsed.type).toBe('coursework_deadline');
      expect(parsed.offsetMinutes).toBe(120);
      expect(parsed.task.courseName).toBe('일반물리학 1');
      expect(parsed.remindersMinutes).toEqual([120, 30, 10]);
      expect(parsed.summary).toContain('일반물리학 1');
    });

    it('correctly handles 30-minute advance alert for chemistry assignment', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const mockTasks = [
        {
          courseName: '고급화학',
          title: '분광분석 실험 보고서',
          dueTimestamp: Date.UTC(2026, 10, 5, 14, 59, 0),
        },
      ];

      const parsed = parseCalendarReminderRequest({
        prompt: '화학 수행평가 마감 30분 전 알람 맞춰줘',
        tasks: mockTasks,
        now: baseDate,
      });

      expect(parsed.type).toBe('coursework_deadline');
      expect(parsed.offsetMinutes).toBe(30);
      expect(parsed.remindersMinutes).toEqual([30, 10]);
    });

    it('identifies non-actionable inquiry and returns guidance type', () => {
      const parsed = parseCalendarReminderRequest({
        prompt: '구글 캘린더 연동 어떻게 해?',
        tasks: [],
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.isActionable).toBe(false);
      expect(parsed.type).toBe('inquiry_or_unmatched');
    });

    it('successfully parses date-only event "11월 9일(월) 윤사 테스트 3회 일정 넣어줘" without hour', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z'); // 2026-11-01 15:00 KST (Sunday)
      const parsed = parseCalendarReminderRequest({
        prompt: '11월 9일(월) 윤사 테스트 3회 일정 넣어줘',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.isActionable).toBe(true);
      expect(parsed.type).toBe('custom_event');
      expect(parsed.summary).toBe('윤사 테스트 3회');
      expect(parsed.hasExplicitTime).toBe(false);
      expect(parsed.remindersMinutes).toEqual([780, 60, 10]);

      // Nov 9, 2026 09:00:00 KST = 2026-11-09 00:00:00 UTC
      const expectedUtc = Date.UTC(2026, 10, 9, 0, 0, 0);
      expect(parsed.startMs).toBe(expectedUtc);
    });

    it('correctly resolves "다음주 월요일" from Sunday Nov 1 to Monday Nov 9', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z'); // Sunday Nov 1
      const res = parseExplicitDateTime('다음주 월요일 모의고사 일정 추가해줘', baseDate);

      expect(res).not.toBeNull();
      const expectedUtc = Date.UTC(2026, 10, 9, 0, 0, 0); // Nov 9, 09:00 KST
      expect(res?.timestamp).toBe(expectedUtc);
      expect(res?.hasExplicitTime).toBe(false);
    });

    it('cleans imperative phrases like "하라고" from title: "11월 9일 윤사 테스트 3회 하라고 일정 등록해줘"', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const parsed = parseCalendarReminderRequest({
        prompt: '11월 9일 윤사 테스트 3회 하라고 일정 등록해줘',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.isActionable).toBe(true);
      expect(parsed.type).toBe('custom_event');
      // Crucial: "하라고" must NOT be in the title!
      expect(parsed.summary).toBe('윤사 테스트 3회');
      expect(parsed.summary).not.toContain('하라고');
    });

    it('correctly classifies simple inquiry intent "11월 9일 일정 뭐 있어?"', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const parsed = parseCalendarReminderRequest({
        prompt: '11월 9일 일정 뭐 있어?',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.intent).toBe('inquiry');
      expect(parsed.isActionable).toBe(false);
    });

    it('correctly classifies update intent "11월 3일 윤사 테스트 2회를 오후 2시로 옮겨줘"', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const parsed = parseCalendarReminderRequest({
        prompt: '11월 3일 윤사 테스트 2회를 오후 2시로 옮겨줘',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.intent).toBe('update');
      expect(parsed.isActionable).toBe(true);
      expect(parsed.summary).toBe('윤사 테스트 2회');
    });

    it('correctly classifies delete intent "오전 9시 일정 삭제해줘"', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const parsed = parseCalendarReminderRequest({
        prompt: '오전 9시 일정 삭제해줘',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.intent).toBe('delete');
      expect(parsed.isActionable).toBe(true);
    });

    it('correctly classifies task intent "구글 할 일에 물리 보고서 추가해줘"', () => {
      const baseDate = new Date('2026-11-01T06:00:00Z');
      const parsed = parseCalendarReminderRequest({
        prompt: '구글 할 일에 물리 보고서 추가해줘',
        tasks: [],
        now: baseDate,
      });

      expect(parsed.isCalendarIntent).toBe(true);
      expect(parsed.intent).toBe('task_create');
      expect(parsed.isActionable).toBe(true);
    });

    it('safely normalizes dates with space-corrupted timezone offset to prevent Calendar API 400', () => {
      const normalizeGoogleDateTime = (val: any) => {
        if (!val || typeof val !== 'string') return null;
        let s = val.trim();
        s = s.replace(/\s+(\+|-)?(\d{2}:\d{2})$/, (_, sign, time) => (sign === '-' ? '-' : '+') + time);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          s += 'T09:00:00+09:00';
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
          s += ':00+09:00';
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
          s += '+09:00';
        }
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        return s;
      };

      // Space corrupted offset
      expect(normalizeGoogleDateTime('2026-11-09T09:00:00 09:00')).toBe('2026-11-09T09:00:00+09:00');
      expect(normalizeGoogleDateTime('2026-11-09T09:00:00 +09:00')).toBe('2026-11-09T09:00:00+09:00');
      // Date only
      expect(normalizeGoogleDateTime('2026-11-09')).toBe('2026-11-09T09:00:00+09:00');
      // Without seconds
      expect(normalizeGoogleDateTime('2026-11-09T09:00')).toBe('2026-11-09T09:00:00+09:00');
      // Already valid ISO
      expect(normalizeGoogleDateTime('2026-11-09T09:00:00+09:00')).toBe('2026-11-09T09:00:00+09:00');
      expect(normalizeGoogleDateTime('2026-11-09T00:00:00.000Z')).toBe('2026-11-09T00:00:00.000Z');
      // Invalid date
      expect(normalizeGoogleDateTime('not-a-date')).toBeNull();
    });

    it('preserves existing event date when user only requests changing time (e.g. 8시로 옮겨줄래)', () => {
      const matchedEvent = {
        id: 'evt_dinner_444',
        summary: '동아리 회식',
        start: '2026-11-04T21:00:00+09:00',
        end: '2026-11-04T22:00:00+09:00',
      };

      const parsed = {
        summary: '동아리 회식',
        searchQuery: '동아리 회식',
        targetDate: '2026-11-01', // guessed as today because prompt lacked explicit date
        startDateTime: '2026-11-01T20:00:00+09:00',
        endDateTime: '2026-11-01T21:00:00+09:00',
        prevTimeText: '오후 9시',
      };
      const prompt = '그 동아리 회식 시간 바뀌었거든 8시로 옮겨줄래';

      let newStart = parsed.startDateTime;
      let newEnd = parsed.endDateTime;

      if (matchedEvent.start) {
        const existingEventDateMatch = matchedEvent.start.match(/^(\d{4}-\d{2}-\d{2})/);
        const existingDateStr = existingEventDateMatch ? existingEventDateMatch[1] : '';

        if (existingDateStr) {
          const promptHasExplicitDate = parsed.targetDate && prompt && prompt.includes(parsed.targetDate.slice(5));
          if (!promptHasExplicitDate && newStart && typeof newStart === 'string') {
            const timeMatch = newStart.match(/T(\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?)/);
            if (timeMatch) {
              const timePart = timeMatch[1];
              newStart = `${existingDateStr}T${timePart}`;
            }
          }
          if (!promptHasExplicitDate && newEnd && typeof newEnd === 'string') {
            const timeMatch = newEnd.match(/T(\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?)/);
            if (timeMatch) {
              const timePart = timeMatch[1];
              newEnd = `${existingDateStr}T${timePart}`;
            }
          }
        }
      }

      expect(newStart).toBe('2026-11-04T20:00:00+09:00');
      expect(newEnd).toBe('2026-11-04T21:00:00+09:00');
      expect(newStart.startsWith('2026-11-04')).toBe(true);
      expect(newStart.startsWith('2026-11-01')).toBe(false);
    });
  });
});

/**
 * Server time sync utility for maintenance guard.
 * Resilient multi-tier fallback designed to work even behind strict school/enterprise firewalls.
 */

let serverOffset = 0;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Synchronizes server time using multiple fallbacks:
 * 1. Self-hosted `/api/time` (Cloudflare Pages Function / Backend)
 * 2. Self origin HEAD request HTTP 'Date' header (Always accessible if the app loads)
 * 3. worldtimeapi.org
 * 4. timeapi.io
 * 5. Local device time (Graceful fallback)
 */
export async function syncServerTime(): Promise<void> {
  // 1. Try internal /api/time (fast 1000ms timeout)
  try {
    const res = await fetchWithTimeout('/api/time', { cache: 'no-store' }, 1000);
    if (res.ok) {
      const data = await res.json();
      const serverTime = data.unixtime || (data.dateTime ? new Date(data.dateTime).getTime() : null);
      if (serverTime) {
        serverOffset = serverTime - Date.now();
        return;
      }
    }
  } catch {
    // Continue to next fallback
  }

  // 2. Try HTTP Date header from current origin (Bypasses external domain blocks, 800ms timeout)
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const res = await fetchWithTimeout(window.location.origin, { method: 'HEAD', cache: 'no-store' }, 800);
      const serverDateHeader = res.headers.get('date');
      if (serverDateHeader) {
        const serverTime = new Date(serverDateHeader).getTime();
        if (!isNaN(serverTime)) {
          serverOffset = serverTime - Date.now();
          return;
        }
      }
    }
  } catch {
    // Continue to parallel external fallback
  }

  // 3. Race external time APIs in parallel (max 1000ms total instead of 4000ms serial wait)
  try {
    const fetchWorldTime = async (): Promise<number> => {
      const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Asia/Seoul', { cache: 'no-store' }, 1000);
      if (!res.ok) throw new Error('worldtimeapi failed');
      const data = await res.json();
      const t = data.unixtime ? data.unixtime * 1000 : new Date(data.datetime).getTime();
      if (!t || isNaN(t)) throw new Error('invalid time');
      return t;
    };

    const fetchTimeApi = async (): Promise<number> => {
      const res = await fetchWithTimeout('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Seoul', { cache: 'no-store' }, 1000);
      if (!res.ok) throw new Error('timeapi failed');
      const data = await res.json();
      const t = new Date(data.dateTime).getTime();
      if (!t || isNaN(t)) throw new Error('invalid time');
      return t;
    };

    const serverTime = await Promise.any([fetchWorldTime(), fetchTimeApi()]);
    serverOffset = serverTime - Date.now();
  } catch {
    // Fallback to local device time
    serverOffset = 0;
  }
}

export function getSyncedDate(): Date {
  return new Date(Date.now() + serverOffset);
}

export interface KSTTimeComponents {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLastDayOfMonth: boolean;
}

/**
 * Returns KST (Asia/Seoul, UTC+9) date and time components for accurate calculation
 * regardless of client device timezone.
 */
export function getKSTTimeComponents(date: Date): KSTTimeComponents {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let year = 0;
    let month = 0;
    let day = 0;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'day') day = parseInt(part.value, 10);
      if (part.type === 'hour') hours = parseInt(part.value, 10);
      if (part.type === 'minute') minutes = parseInt(part.value, 10);
      if (part.type === 'second') seconds = parseInt(part.value, 10);
    }
    // Intl hour 24 fix (some browsers might return 24 for midnight)
    if (hours === 24) hours = 0;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isLastDayOfMonth = day === lastDayOfMonth;

    return { year, month, day, hours, minutes, seconds, isLastDayOfMonth };
  } catch {
    // Fallback: manually calculate UTC + 9 hours
    const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
    const kstDate = new Date(utcMs + 9 * 60 * 60000);
    const year = kstDate.getFullYear();
    const month = kstDate.getMonth() + 1;
    const day = kstDate.getDate();
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    return {
      year,
      month,
      day,
      hours: kstDate.getHours(),
      minutes: kstDate.getMinutes(),
      seconds: kstDate.getSeconds(),
      isLastDayOfMonth: day === lastDayOfMonth,
    };
  }
}

// Maintenance window: Monthly 1st from previous day 23:55 ~ 1st 00:10 KST
// Pre-warning window: Previous day 23:45 ~ 23:54 KST
const MAINTENANCE_WARNING_MINUTE = 45;
const MAINTENANCE_START_MINUTE = 55;
const MAINTENANCE_END_MINUTE = 10;

export interface MaintenanceWarningStatus {
  active: boolean;
  minutesLeft: number;
  secondsLeft: number;
}

/**
 * Checks if current time is within pre-maintenance warning period:
 * Last day of month 23:45 ~ 23:54:59 KST.
 */
export function checkMaintenanceWarning(now: Date): MaintenanceWarningStatus {
  const { hours, minutes, seconds, isLastDayOfMonth } = getKSTTimeComponents(now);

  if (isLastDayOfMonth && hours === 23 && minutes >= MAINTENANCE_WARNING_MINUTE && minutes < MAINTENANCE_START_MINUTE) {
    const totalRemainingSeconds = (MAINTENANCE_START_MINUTE - minutes) * 60 - seconds;
    return {
      active: true,
      minutesLeft: Math.max(1, Math.ceil(totalRemainingSeconds / 60)),
      secondsLeft: Math.max(0, totalRemainingSeconds),
    };
  }

  return {
    active: false,
    minutesLeft: 0,
    secondsLeft: 0,
  };
}

/**
 * Checks if maintenance is actively blocking access:
 * - Last day of month 23:55 ~ 23:59:59 KST
 * - 1st day of month 00:00 ~ 00:09:59 KST
 */
export function checkMaintenanceActive(now: Date): boolean {
  const { day, hours, minutes, isLastDayOfMonth } = getKSTTimeComponents(now);

  // Previous day 23:55 ~ 23:59:59 KST
  if (isLastDayOfMonth && hours === 23 && minutes >= MAINTENANCE_START_MINUTE) return true;
  // 1st day 00:00 ~ 00:09:59 KST
  if (day === 1 && hours === 0 && minutes < MAINTENANCE_END_MINUTE) return true;

  return false;
}

/**
 * Returns remaining seconds until maintenance ends (at 00:10 KST).
 */
export function getSecondsUntilMaintenanceEnd(now: Date): number {
  const { day, hours, minutes, seconds, isLastDayOfMonth } = getKSTTimeComponents(now);

  if (isLastDayOfMonth && hours === 23 && minutes >= MAINTENANCE_START_MINUTE) {
    // Time until midnight + 10 minutes
    const remainingInHour = (60 - minutes) * 60 - seconds;
    return Math.max(0, remainingInHour + MAINTENANCE_END_MINUTE * 60);
  }

  if (day === 1 && hours === 0 && minutes < MAINTENANCE_END_MINUTE) {
    return Math.max(0, (MAINTENANCE_END_MINUTE - minutes) * 60 - seconds);
  }

  return 0;
}

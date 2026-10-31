import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  getKSTTimeComponents,
  checkMaintenanceWarning,
  checkMaintenanceActive,
  getSecondsUntilMaintenanceEnd,
} from '../utils/timeSync';
import { MaintenanceGuard } from '../components/MaintenanceGuard';
import * as timeSyncModule from '../utils/timeSync';
import { useUIStore } from '../stores/useUIStore';

// Helper to create Date from KST string: "YYYY-MM-DDTHH:mm:ss+09:00"
function createKSTDate(kstIsoString: string): Date {
  return new Date(kstIsoString);
}

describe('Monthly Maintenance Schedule & Pre-warning Logic', () => {
  describe('KST Date Parsing & Last Day of Month Detection', () => {
    it('detects last day of month correctly for standard 31-day months (e.g. October 31)', () => {
      const date31 = createKSTDate('2026-10-31T23:45:00+09:00');
      const comp31 = getKSTTimeComponents(date31);
      expect(comp31.year).toBe(2026);
      expect(comp31.month).toBe(10);
      expect(comp31.day).toBe(31);
      expect(comp31.isLastDayOfMonth).toBe(true);

      const date30 = createKSTDate('2026-10-30T23:45:00+09:00');
      const comp30 = getKSTTimeComponents(date30);
      expect(comp30.isLastDayOfMonth).toBe(false);
    });

    it('detects last day of month correctly for 30-day months (e.g. November 30)', () => {
      const date30 = createKSTDate('2026-11-30T23:45:00+09:00');
      const comp30 = getKSTTimeComponents(date30);
      expect(comp30.month).toBe(11);
      expect(comp30.day).toBe(30);
      expect(comp30.isLastDayOfMonth).toBe(true);
    });

    it('detects last day of February for common years (28th) and leap years (29th)', () => {
      // 2026 is a common year: Feb has 28 days
      const feb28Common = createKSTDate('2026-02-28T23:45:00+09:00');
      expect(getKSTTimeComponents(feb28Common).isLastDayOfMonth).toBe(true);

      const feb27Common = createKSTDate('2026-02-27T23:45:00+09:00');
      expect(getKSTTimeComponents(feb27Common).isLastDayOfMonth).toBe(false);

      // 2024 is a leap year: Feb has 29 days
      const feb28Leap = createKSTDate('2024-02-28T23:45:00+09:00');
      expect(getKSTTimeComponents(feb28Leap).isLastDayOfMonth).toBe(false);

      const feb29Leap = createKSTDate('2024-02-29T23:45:00+09:00');
      expect(getKSTTimeComponents(feb29Leap).isLastDayOfMonth).toBe(true);
    });
  });

  describe('Pre-warning Period (Last day 23:45 ~ 23:54 KST)', () => {
    it('is inactive before 23:45 on the last day', () => {
      const date = createKSTDate('2026-10-31T23:44:59+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(false);
      expect(warning.minutesLeft).toBe(0);
    });

    it('is active at exactly 23:45:00 on the last day with 10 minutes left', () => {
      const date = createKSTDate('2026-10-31T23:45:00+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(true);
      expect(warning.minutesLeft).toBe(10);
      expect(warning.secondsLeft).toBe(600);
    });

    it('correctly calculates minutes left during warning window (e.g. 23:50:00 -> 5 minutes)', () => {
      const date = createKSTDate('2026-10-31T23:50:00+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(true);
      expect(warning.minutesLeft).toBe(5);
      expect(warning.secondsLeft).toBe(300);
    });

    it('handles seconds remaining rounding up minutes (e.g. 23:54:30 -> 1 minute)', () => {
      const date = createKSTDate('2026-10-31T23:54:30+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(true);
      expect(warning.minutesLeft).toBe(1);
      expect(warning.secondsLeft).toBe(30);
    });

    it('becomes inactive at 23:55:00 (when maintenance starts)', () => {
      const date = createKSTDate('2026-10-31T23:55:00+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(false);
    });

    it('never triggers on normal days (e.g. 15th 23:45:00)', () => {
      const date = createKSTDate('2026-10-15T23:45:00+09:00');
      const warning = checkMaintenanceWarning(date);
      expect(warning.active).toBe(false);
    });
  });

  describe('Active Maintenance Blocking Period (Last day 23:55 ~ 1st 00:10 KST)', () => {
    it('blocks access starting at last day 23:55:00 KST', () => {
      const beforeStart = createKSTDate('2026-10-31T23:54:59+09:00');
      expect(checkMaintenanceActive(beforeStart)).toBe(false);

      const exactStart = createKSTDate('2026-10-31T23:55:00+09:00');
      expect(checkMaintenanceActive(exactStart)).toBe(true);

      const endOfPrevDay = createKSTDate('2026-10-31T23:59:59+09:00');
      expect(checkMaintenanceActive(endOfPrevDay)).toBe(true);
    });

    it('continues blocking access on 1st day 00:00:00 ~ 00:09:59 KST', () => {
      const midnight = createKSTDate('2026-11-01T00:00:00+09:00');
      expect(checkMaintenanceActive(midnight)).toBe(true);

      const duringMaintenance = createKSTDate('2026-11-01T00:05:30+09:00');
      expect(checkMaintenanceActive(duringMaintenance)).toBe(true);

      const justBeforeReopen = createKSTDate('2026-11-01T00:09:59+09:00');
      expect(checkMaintenanceActive(justBeforeReopen)).toBe(true);
    });

    it('re-opens service at exactly 1st day 00:10:00 KST', () => {
      const reopened = createKSTDate('2026-11-01T00:10:00+09:00');
      expect(checkMaintenanceActive(reopened)).toBe(false);

      const later = createKSTDate('2026-11-01T00:15:00+09:00');
      expect(checkMaintenanceActive(later)).toBe(false);
    });

    it('does NOT block access on other days (e.g. 15th 23:55 or 16th 00:05)', () => {
      const day15Night = createKSTDate('2026-10-15T23:55:00+09:00');
      expect(checkMaintenanceActive(day15Night)).toBe(false);

      const day16Early = createKSTDate('2026-10-16T00:05:00+09:00');
      expect(checkMaintenanceActive(day16Early)).toBe(false);
    });
  });

  describe('Remaining Seconds Calculation (getSecondsUntilMaintenanceEnd)', () => {
    it('returns 900 seconds at previous day 23:55:00 (15 minutes total)', () => {
      const date = createKSTDate('2026-10-31T23:55:00+09:00');
      expect(getSecondsUntilMaintenanceEnd(date)).toBe(900);
    });

    it('returns 600 seconds at 1st day 00:00:00 (10 minutes remaining)', () => {
      const date = createKSTDate('2026-11-01T00:00:00+09:00');
      expect(getSecondsUntilMaintenanceEnd(date)).toBe(600);
    });

    it('returns 1 second at 1st day 00:09:59', () => {
      const date = createKSTDate('2026-11-01T00:09:59+09:00');
      expect(getSecondsUntilMaintenanceEnd(date)).toBe(1);
    });

    it('returns 0 seconds at 1st day 00:10:00 and outside maintenance window', () => {
      const dateAtEnd = createKSTDate('2026-11-01T00:10:00+09:00');
      expect(getSecondsUntilMaintenanceEnd(dateAtEnd)).toBe(0);

      const normalDate = createKSTDate('2026-10-15T12:00:00+09:00');
      expect(getSecondsUntilMaintenanceEnd(normalDate)).toBe(0);
    });
  });
});

describe('MaintenanceGuard Component Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(timeSyncModule, 'syncServerTime').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders children and no warning/blocking screen during normal operation', async () => {
    vi.spyOn(timeSyncModule, 'getSyncedDate').mockReturnValue(createKSTDate('2026-10-15T14:00:00+09:00'));

    render(
      <MaintenanceGuard>
        <div data-testid="app-content">Community Content</div>
      </MaintenanceGuard>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-warning-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/시스템 정기 점검 안내/i)).not.toBeInTheDocument();
  });

  it('renders pre-warning banner and triggers toast notification at last day 23:45', async () => {
    const addToastSpy = vi.spyOn(useUIStore.getState(), 'addToast');
    vi.spyOn(timeSyncModule, 'getSyncedDate').mockReturnValue(createKSTDate('2026-10-31T23:45:00+09:00'));

    render(
      <MaintenanceGuard>
        <div data-testid="app-content">Community Content</div>
      </MaintenanceGuard>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Content still accessible
    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    // Warning banner is displayed
    const banner = screen.getByTestId('maintenance-warning-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/10분 뒤/i);

    // Toast triggered
    expect(addToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('10분 뒤(23:55) 시작됩니다'),
      'info'
    );
  });

  it('blocks access and displays full-screen maintenance guard at last day 23:55', async () => {
    vi.spyOn(timeSyncModule, 'getSyncedDate').mockReturnValue(createKSTDate('2026-10-31T23:55:00+09:00'));

    render(
      <MaintenanceGuard>
        <div data-testid="app-content">Community Content</div>
      </MaintenanceGuard>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Children content is blocked
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    // Maintenance modal is visible
    expect(screen.getByText('시스템 정기 점검 안내')).toBeInTheDocument();
    expect(screen.getByText(/매월 1일 00:00 ~ 00:10/i)).toBeInTheDocument();
    // Countdown should show 15:00
    expect(screen.getByText('15:00')).toBeInTheDocument();
  });

  it('automatically unblocks when time reaches 1st day 00:10:00', async () => {
    let mockCurrent = createKSTDate('2026-11-01T00:09:59+09:00');
    vi.spyOn(timeSyncModule, 'getSyncedDate').mockImplementation(() => mockCurrent);

    render(
      <MaintenanceGuard>
        <div data-testid="app-content">Community Content</div>
      </MaintenanceGuard>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(screen.getByText('시스템 정기 점검 안내')).toBeInTheDocument();

    // Advance time by 2 seconds to reach 00:10:01
    mockCurrent = createKSTDate('2026-11-01T00:10:01+09:00');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Content should now be visible
    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    expect(screen.queryByText('시스템 정기 점검 안내')).not.toBeInTheDocument();
  });
});
